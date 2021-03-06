import { batch } from "promises-tho";
import { debug } from "debug";
import { SourceEnvironment } from "./source-environment";
import { TargetEnvironment } from "./target-environment";
import { Upload } from "./upload";
import { TxUpload } from "./tx-upload";

export async function* doUpload(sourceEnv: SourceEnvironment, targetEnv: TargetEnvironment, upload: Upload) {
  const log = debug("do-upload:main");
  
  log(`starting iterator: ${upload.queued.length}, ${upload.pending.length}, ${upload.mined.length}, ${upload.complete.length}`);
  
  if (upload.maxPendingBytes < upload.MAX_TX_SIZE) {
    throw new Error(`maxPendingBytes must be at least MAX_TX_SIZE: ${upload.MAX_TX_SIZE}`);
  }

  if (upload.mined.length == 0 && upload.pending.length == 0 && upload.queued.length == 0) {
    // Passed in an upload with no work to do.
    // Give back the state and finish the iteration. 
    yield upload;
    return;
  }

  if (upload.pending.length || upload.mined.length) {
    // Passed in a job that is being resumed and has some 
    // pending/mined txs, we check these and give back the latest
    // state to caller before continuing.
    log(`Resuming upload with pending or mined TXs to check`);
    let minOrder = Number.POSITIVE_INFINITY;
    upload.pending.forEach(x => minOrder = Math.min(x.order, minOrder));
    upload.queued.forEach(x => minOrder = Math.min(x.order, minOrder));

    log(`Min order in pending or queued: ${minOrder}`);
    await checkAndMutateStatus(targetEnv, upload.pending);
    await checkAndMutateStatus(targetEnv, upload.mined);
    // Give back current state.
    log(`after resume check: ${upload.queued.length}, ${upload.pending.length}, ${upload.mined.length}, ${upload.complete.length}`);
    yield upload;
  }

  while (true) {
    // See if we can add more TXs into flight, while keeping below quotas.
    await moreIntoFlight(sourceEnv, targetEnv, upload);

    // Give back current state.
    log(`after moveIntoFlight: ${upload.queued.length}, ${upload.pending.length}, ${upload.mined.length}, ${upload.complete.length}`);
  
    yield upload;

    // Delay and check and upate statuses.
    log(`Delaying ${upload.pollTime} seconds before checking status.`);
    await new Promise(res => setTimeout(res, upload.pollTime * 1000));

    await checkAndMutateStatus(targetEnv, upload.pending);
    await checkAndMutateStatus(targetEnv, upload.mined);

    // Free up memory to be gc'ed for complete transactions.
    // Un-decided if theres any benefit to keeping around pending/mined tx
    // data ...

    // upload.pending.forEach(x => x.transaction = null);
    // upload.mined.forEach(x => x.transaction = null);
    upload.complete.forEach(x => (x.transaction = null));

    // Give back current state.
    yield upload;

    // End iteration if we have nothing left to do.
    if (upload.mined.length == 0 && upload.pending.length == 0 && upload.queued.length == 0) {
      return;
    }
  }
}

async function moreIntoFlight(sourceEnv: SourceEnvironment, targetEnv: TargetEnvironment, upload: Upload) {
  const toPost: TxUpload[] = [];
  const log = debug("do-upload:add-more");

  log(
    `queued: ${upload.queued.length}, pending: ${upload.pending.length} (${(upload.pendingBytes / 1024 / 1024).toFixed(2)} MiB), mined: ${
      upload.mined.length
    }, complete: ${upload.complete.length}`
  );

  // This will give us copies to work with for the while loop.
  // This is not super clear but they are getters on the Upload object which make a
  // shallow copy.
  const pending = upload.pending;
  const queued = upload.queued;
  
  // Get the minimum 'order' value thats currently in the pending 
  // or queued list. We only only post items with order > to this 
  // value. 
  let minOrder = Number.POSITIVE_INFINITY;
  pending.forEach(x => minOrder = Math.min(x.order, minOrder));
  queued.forEach(x => minOrder = Math.min(x.order, minOrder));

  log(`Min order in pending or queued: ${minOrder}`);
  let pendingData = upload.pendingBytes;
  let pendingCount = pending.length;
  
  while (pendingCount < upload.maxPendingTxs && pendingData < upload.maxPendingBytes && queued.length) {
    const next = queued.shift()!;
    
    if (next.order > minOrder) {
      continue;
    }

    // Check if we can find an existing txid.
    // If found this we mark it as: 'mined' with -1 confirmations.
    // This will ensure it gets checked for status and moved into
    // the approriate state.
    if (await dedupeAndMutateToMined(sourceEnv, next)) {
      continue;
    }

    // Check if this transaction is too big to put in flight with the current batch
    // and skip it if so.
    next.transaction = await sourceEnv.retrieveTransaction(next.item, upload);

    if (next.transaction.data && next.transaction.data.byteLength + pendingData > upload.maxPendingBytes) {
      continue;
    }

    toPost.push(next);
    pendingData += next.transaction.data ? next.transaction.data.byteLength : 0;
    pendingCount += 1;
  }

  log(`Posting an extra ${toPost.length} TXs, for ${pendingCount} TXs in flight, totalling ${(pendingData / 1024 / 1024).toFixed(2)} MiB`);

  // Note: if postTransaction throws, this will throw and end the entire
  // upload. This is what we want. postTransaction() should not throw lightly.

  await Promise.all(
    toPost.map(async x => {
      if (!x.transaction) {
        x.transaction = await sourceEnv.retrieveTransaction(x.item, upload);
      }
      const resp = await targetEnv.postTransaction(x.transaction);
      const txId = typeof resp === "string" ? resp : resp.id;
      mutateToPending(x, txId);
    })
  );
}

async function dedupeAndMutateToMined(sourceEnv: SourceEnvironment, p: TxUpload): Promise<boolean> {
  if (sourceEnv.dedupTransaction && p.transaction) {
    const existingId = await sourceEnv.dedupTransaction(p.item);
    if (existingId) {
      // Assumed to be mined, but -1 confirms so it's always checked.
      p.status = 200;
      p.confirmations = -1;
      return true;
    }
  }
  return false;
}

function checkAndMutateStatus(targetEnv: TargetEnvironment, posts: TxUpload[]) {
  return batch({ batchSize: 3, batchDelayMs: 30 }, async (x: TxUpload) => {
    const status = await targetEnv.getStatus(x.id!);

    if (status.status == 200 && status.confirmed) {
      x.status = 200;
      x.confirmations = status.confirmed.number_of_confirmations;
    } else if (status.status == 404) {
      x.status = 404;
      x.confirmations = -1;
    } else if (status.status == 202) {
      x.status = 202;
      x.confirmations = -1;
    } else {
      throw new Error(`Received unknown status code from getStatus(): ${x.status}`);
    }
  })(posts);
}

function mutateToPending(p: TxUpload, id: string) {
  p.id = id;
  p.status = 202;
  p.confirmations = -1;
  p.byteSize = p.transaction!.data ? p.transaction!.data.byteLength : 0;
}
