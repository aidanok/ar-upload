import { debug } from "debug";
import { SourceEnvironment } from "../src/source-environment";
import { TransactionParameters } from "../src/transaction-parameters";
import { TargetEnvironment } from "../src/target-environment";

const randomFloatBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const randomIntBetween = (min: number, max: number) => Math.round(randomFloatBetween(min, max));

/**
 * This Mock SourceEnvironment just returns a random chunk of data
 * for any item requested.
 */
export class MockSourceEnvironment implements SourceEnvironment {
  retrieved = 0;
  retrievedTotalSize = 0;

  randomByteSizeMin = 1024 * 1024 * 0.25;
  randomByteSizeMax = 1024 * 1024 * 10;

  log = debug("mock-env:mock-source");

  async retrieveTransaction(item: string): Promise<TransactionParameters> {
    const data = new ArrayBuffer(randomIntBetween(this.randomByteSizeMin, this.randomByteSizeMax));

    this.retrieved++;
    this.retrievedTotalSize += data.byteLength;
    // this.log(`Retrieved TX data for item: ${item}, bytes: ${data.byteLength}`)
    return {
      data,
      tags: [{ name: "Content-Type", value: "application/octect-stream" }],
      reward: "0.1"
    };
  }
}

interface MockBlock {
  block_indep_hash: string;
  txs: { id: string; transaction: TransactionParameters }[];
}

/**
 * A mock target environment that simulates mining blocks.
 * We do this so we simulate TX's get orphaned as groups
 * for a slighlty more realistic mock environment.
 *
 * You need to call mineBlocks() to start the mining loop,
 * and stopMining() to finish it and let the process exit.
 *
 * This doesn't accurately model mining times, 'blockTimeSeconds'
 * is the maximum time it takes to mine a block, rather than
 * the average, but this is fine for testing purposes.
 *
 */
export class MockTargetEnvironment implements TargetEnvironment {
  orphanChance = 0.1;
  oprhanMaxBlocks = 2;

  blockTimeSeconds = 120;
  maxTxsPerBlock = 1000;

  posted = 0;
  postedTotalSize = 0;
  orphanedTxCount = 0;
  orphanedTotalBytes = 0;

  // Mined blocks..
  minedBlocks: MockBlock[] = [];

  // Pending txs.
  pendingTxs: { id: string; transaction: TransactionParameters }[] = [];

  idGen = 90000;
  blockHashGen = 10000;

  mining = false;

  log = debug("mock-env:target");

  async postTransaction(transaction: TransactionParameters): Promise<string> {
    this.posted++;
    this.postedTotalSize += transaction.data ? transaction.data.byteLength : 0;
    const id = `Tx_${++this.idGen}`;
    this.pendingTxs.push({ id, transaction });
    return id;
  }

  async getStatus(
    id: string
  ): Promise<{ status: number; confirmed: null | { number_of_confirmations: number; block_indep_hash: string } }> {
    let blockIndex = this.minedBlocks.findIndex(x => !!x.txs.find(tx => tx.id === id));

    if (blockIndex >= 0) {
      const confirms = this.minedBlocks.length - 1 - blockIndex;
      return {
        status: 200,
        confirmed: { number_of_confirmations: confirms, block_indep_hash: this.minedBlocks[blockIndex].block_indep_hash }
      };
    } else if (this.pendingTxs.find(tx => tx.id === id)) {
      return { status: 202, confirmed: null };
    } else {
      return { status: 404, confirmed: null };
    }
  }

  // this mineBlocks stuff is not used but would give a more accurate
  // model than TXs having an individual chance of being orphaned every
  // time we go increment their confirms. (which happens in getStatus above)
  async mineBlocks() {
    this.mining = true;

    while (this.mining) {
      await new Promise(res => setTimeout(res, 1000 * randomFloatBetween(this.blockTimeSeconds * 0.05, this.blockTimeSeconds)));

      if (!this.mining) {
        // cancelled.
        return;
      }

      if (Math.random() < this.orphanChance) {
        const orphanedBlocksCount = randomIntBetween(1, this.oprhanMaxBlocks);
        this.orphanBlocks(orphanedBlocksCount);
      }
      
      const txCount = Math.min(this.maxTxsPerBlock, randomIntBetween(0, this.pendingTxs.length * 3));
      this.mineBlock(txCount);

    }
  }

  stopMining() {
    this.mining = false;
  }

  // This can be called directly by tests to advance to a certain state. 
  mineBlock(txCount: number) {
    const txsToMine = this.pendingTxs.splice(0, txCount);
    const blockHash = `Block_${++this.blockHashGen}`;
    this.log(`Mining new block ${blockHash} with ${txsToMine.length} TXs`);

    this.minedBlocks.push({
      block_indep_hash: blockHash,
      txs: txsToMine
    });
  }

  // This can be called directly by tests to advance to a certain state.
  orphanBlocks(orphanedBlocksCount: number) {
    const orphanedBlocks = this.minedBlocks.splice(this.minedBlocks.length - orphanedBlocksCount, orphanedBlocksCount);
    this.log(`Orphaning ${orphanedBlocksCount} blocks`);
    this.orphanedTxCount += orphanedBlocks.reduce((total, b) => (total += b.txs.length), 0);
    this.orphanedTotalBytes += orphanedBlocks.reduce(
      (total, b) =>
        (total += b.txs.reduce((totalBytes, tx) => (totalBytes += tx.transaction.data ? tx.transaction.data.byteLength : 0), 0)),
      0
    );
    this.log(`Orphaned totals: ${this.orphanedTxCount} TXs, ${this.orphanedTotalBytes} bytes`);
  }

}
