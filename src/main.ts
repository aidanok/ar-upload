
import { Options, DEFAULT_OPTIONS } from "./options";
import { batch } from "promises-tho";
import { debug } from "debug";
import { TransactionParameters } from "./transaction-parameters";
import { SourceEnvironment } from "./source-environment";
import { TargetEnvironment } from "./target-environment";

export interface TxPostProgress {
  identifier: string;
  id: null | string;
  confirmations: number;
  status: number;
  transaction: null | TransactionParameters;
  byteSize: number;
}

export function multiUpload(sourceEnv: SourceEnvironment, targetEnv: TargetEnvironment, identifiers: string[], options?: Partial<Options>) {
  const opts = Object.assign(DEFAULT_OPTIONS, options);

  if (opts.maxPendingBytes < opts.MAX_TX_SIZE) {
    throw new Error(`maxPendingBytes must be at least MAX_TX_SIZE: ${opts.MAX_TX_SIZE}`);
  }

  const tpps: TxPostProgress[] = identifiers.map(identifier => ({
    identifier,
    id: null,
    confirmations: -1,
    status: 404,
    transaction: null,
    byteSize: 0
  }));

  return resumeMultiUpload(sourceEnv, targetEnv, opts, tpps);
}

export async function* resumeMultiUpload(
  sourceEnv: SourceEnvironment,
  targetEnv: TargetEnvironment,
  options: Partial<Options>,
  ...tppsArray: TxPostProgress[][]
) {
  const tpps = tppsArray.reduce((a, x) => [...a, ...x]);
  const opts = Object.assign(DEFAULT_OPTIONS, options);
  const log = debug("post-many:main");

  if (opts.maxPendingBytes < opts.MAX_TX_SIZE) {
    throw new Error(`maxPendingBytes must be at least MAX_TX_SIZE: ${opts.MAX_TX_SIZE}`);
  }

  while (true) {
    // See if we can add more TXs into flight, while keeping below quotas.
    await moreIntoFlight(sourceEnv, targetEnv, tpps, opts);

    // Update lists & counts
    let { mined, pending, queued, confirmed, pendingData } = extractProgressState(tpps, opts);

    yield { pending, mined, queued, confirmed };


    // Delay before checking on the status of everything, skip if we have
    // nothing to do.
    if (mined.length > 0 || pending.length > 0 || queued.length > 0) {
      log(`Delaying ${opts.pollTime} seconds before checking status.`);
      await new Promise(res => setTimeout(res, opts.pollTime * 1000));
    }

    await checkAndMutateStatus(targetEnv, pending);
    await checkAndMutateStatus(targetEnv, mined);

    // Update lists & counts.
    ({ mined, pending, queued, confirmed, pendingData } = extractProgressState(tpps, opts));

    log(
      `STATUS: queued: ${queued.length}, pending: ${pending.length} (${(pendingData / 1024 / 1024).toFixed(2)} MiB), mined: ${
        mined.length
      }, confirmed: ${confirmed.length}`
    );

    log(`-----\n`);

    yield { pending, mined, queued, confirmed };

    if (mined.length == 0 && pending.length == 0 && queued.length == 0) {
      return;
    }
  }
}

/**
 * Helper function to categorize transactions and count pending TXs and
 * pending bytes.
 *
 * @param progress The array of all TxPostProgress objects.
 * @param opts Options.
 */
function extractProgressState(progress: TxPostProgress[], opts: Options) {
  const pending = progress.filter(x => x.status === 202 && x.confirmations < 0);
  const mined = progress.filter(x => x.confirmations >= 0 && x.confirmations < opts.confirmationsRequired);
  const queued = progress.filter(x => x.status === 404);
  const confirmed = progress.filter(x => x.status === 200 && x.confirmations >= opts.confirmationsRequired);

  const pendingCount = pending.length;
  const pendingData = pending.reduce((total, x) => (total += x.byteSize), 0);

  return { pending, mined, queued, confirmed, pendingCount, pendingData };
}

async function moreIntoFlight(sourceEnv: SourceEnvironment, targetEnv: TargetEnvironment, progress: TxPostProgress[], opts: Options) {
  let { pending, queued, confirmed, mined, pendingCount, pendingData } = extractProgressState(progress, opts);

  const toPost: typeof progress = [];
  const log = debug("post-many:add-more");

  log(
    `queued: ${queued.length}, pending: ${pending.length} (${(pendingData / 1024 / 1024).toFixed(2)} MiB), mined: ${
      mined.length
    }, confirmed: ${confirmed.length}`
  );

  while (pendingCount < opts.maxPendingTxs && pendingData < opts.maxPendingBytes && queued.length) {
    const next = queued.shift()!;
    next.transaction = await sourceEnv.retrieveTransaction(next.identifier);

    // Check if we can find an existing txid.
    // If found this will mark it as: 'at least pending', but we
    // won't count it against our in-flight quotas.
    if (await dedupeAndMutateToPending(sourceEnv, next)) {
      continue;
    }

    // Check if this transaction is too big to put in flight with the current batch
    // and skip it if so.
    if (next.transaction.data && next.transaction.data.byteLength + pendingData > opts.maxPendingBytes) {
      continue;
    }

    toPost.push(next);
    pendingData += next.transaction.data ? next.transaction.data.byteLength : 0;
    pendingCount += 1;
  }

  log(
    `Will post an additional ${toPost.length} TXs, for ${pendingCount} TXs in flight, totalling ${(pendingData / 1024 / 1024).toFixed(
      2
    )} MiB`
  );

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

async function dedupeAndMutateToPending(sourceEnv: SourceEnvironment, p: TxPostProgress): Promise<boolean> {
  if (sourceEnv.dedupTransaction && p.transaction) {
    const existingId = await sourceEnv.dedupTransaction(p.transaction);
    if (existingId) {
      mutateToPending(p, existingId);
      return true;
    }
  }
  return false;
}

function checkAndMutateStatus(targetEnv: TargetEnvironment, posts: TxPostProgress[]) {
  return batch({ batchSize: 5, batchDelayMs: 30 }, async (x: TxPostProgress) => {
    const status = await targetEnv.getStatus(x.id!);

    if (status.status == 200 && status.confirmed) {
      x.confirmations = status.confirmed.number_of_confirmations;
      x.status = 200;
      // Once we have the required confirmations, remove the transaction
      // so it can be gc'ed.
      x.transaction = null;
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

function mutateToPending(p: TxPostProgress, id: string) {
  p.id = id;
  p.status = 202;
  p.confirmations = -1;
  p.byteSize = p.transaction!.data ? p.transaction!.data.byteLength : 0;
}
