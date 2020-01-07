import { batch } from "promises-tho";
import { debug } from "debug";
import { SourceEnvironment } from "./source-environment";
import { TargetEnvironment } from "./target-environment";
import { Upload, isPending } from "./upload";
import { TxUpload } from "./tx-upload";

export async function* doUpload(sourceEnv: SourceEnvironment, targetEnv: TargetEnvironment, upload: Upload) {
  const log = debug("do-upload:main");

  if (upload.maxPendingBytes < upload.MAX_TX_SIZE) {
    throw new Error(`maxPendingBytes must be at least MAX_TX_SIZE: ${upload.MAX_TX_SIZE}`);
  }

  if (upload.mined.length == 0 && upload.pending.length == 0 && upload.queued.length == 0) {
    // Someone passed in an upload with no work to do.
    yield upload;
    return;
  }

  while (true) {
    // See if we can add more TXs into flight, while keeping below quotas.
    await moreIntoFlight(sourceEnv, targetEnv, upload);

    // Give back current state.
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
    upload.complete.forEach(x => x.transaction = null);

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
  // This is not super clear but they are getters on the Upload object which make a copy.
  // We mutate these shallow copies in the while loop (dequeing and incrementing counts)
  // and then discard them afterwards.
  const pending = upload.pending;
  const queued = upload.queued;
  let pendingData = upload.pendingBytes;
  let pendingCount = pending.length;

  while (pendingCount < upload.maxPendingTxs && pendingData < upload.maxPendingBytes && queued.length) {
    const next = queued.shift()!;
    next.transaction = await sourceEnv.retrieveTransaction(next.identifier);

    // Check if we can find an existing txid.
    // If found this we mark it as: 'mined' with -1 confirmations.
    // This will ensure it gets checked for status and moved into
    // the approriate state.
    if (await dedupeAndMutateToMined(sourceEnv, next)) {
      continue;
    }

    // Check if this transaction is too big to put in flight with the current batch
    // and skip it if so.
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
        x.transaction = await sourceEnv.retrieveTransaction(x.identifier);
      }
      const resp = await targetEnv.postTransaction(x.transaction);
      const txId = typeof resp === "string" ? resp : resp.id;
      mutateToPending(x, txId);
    })
  );

  // Free any tx data so it can be GC'ed, it's been posted and we
  // can retrieve it again if we need to.

  // DONT do this here, since we prefer TXs to keep the same TXID
  // (use the same anchor) if possible. Instead we clear it when
  // we get the required number of confirmations.

  //progress.forEach(x => {
  //  x.transaction = null;
  //});
}

async function dedupeAndMutateToMined(sourceEnv: SourceEnvironment, p: TxUpload): Promise<boolean> {
  if (sourceEnv.dedupTransaction && p.transaction) {
    const existingId = await sourceEnv.dedupTransaction(p.transaction);
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
  return batch({ batchSize: 5, batchDelayMs: 30 }, async (x: TxUpload) => {
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
