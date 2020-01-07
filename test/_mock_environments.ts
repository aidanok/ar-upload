import { debug } from 'debug';
import { SourceEnvironment } from '../src/source-environment';
import { TransactionParameters } from '../src/transaction-parameters';
import { TargetEnvironment } from '../src/target-environment';

/**
 * This Mock SourceEnvironment just returns a random chunk of data
 * for any identifier requested.
 */
export class MockSourceEnvironment implements SourceEnvironment {
  retrieved = 0;
  retrievedTotalSize = 0;

  randomByteSizeMin = 1024 * 1024 * 0.25;
  randomByteSizeMax = 1024 * 1024 * 10;

  log = debug('mock-env:mock-source');

  async retrieveTransaction(identifier: string): Promise<TransactionParameters> {
    const data = new ArrayBuffer(Math.random() * (this.randomByteSizeMax - this.randomByteSizeMin) + this.randomByteSizeMin);

    this.retrieved++;
    this.retrievedTotalSize += data.byteLength;
    // this.log(`Retrieved TX data for identifier: ${identifier}, bytes: ${data.byteLength}`)
    return {
      data,
      tags: [{ name: "Content-Type", value: "application/octect-stream" }],
      reward: "0.1"
    };
  }
}

/**
 * This Mock TargetEnviroment orphans, mines and increases confirms
 * for each TXs independently, it has no concept of blocks
 */
export class MockTargetEnvironment implements TargetEnvironment {
  // Configuration 
  orphanChance = 0.02;
  blockTimeSeconds = 120;

  // Stats
  posted = 0;
  postedTotalSize = 0;
  orphaned = 0;
  orphanedTotalSize = 0;

  // Internal state
  postedMap: Record<
    string,
    {
      tx: TransactionParameters;
      timeToMine: number;
      confirms: number;
      orphaned: boolean;
    }
  > = {};

  idGen = 97000;

  log = debug('mock-env:mock-target')

  async postTransaction(transaction: TransactionParameters): Promise<string> {
    this.posted++;
    this.postedTotalSize += transaction.data ? transaction.data.byteLength : 0;
    const id = `${++this.idGen}`;
    this.postedMap[id] = { tx: transaction, timeToMine: Date.now() + (Math.random() * this.blockTimeSeconds * 1.5 * 1000), confirms: -1, orphaned: false };
    return id;
  }

  async getStatus(id: string): Promise<{ status: number; confirmed: null | { number_of_confirmations: number } }> {
    const item = this.postedMap[id];
    if (item.orphaned) {
      throw new Error("getStatus() called on orphaned id");
    }
    if (item.timeToMine < Date.now()) {
      item.confirms++;
      item.timeToMine = Date.now() + (Math.random() * this.blockTimeSeconds * 1.5 * 1000);
    }
    if (item.confirms >= 0) {
      if (Math.random() < this.orphanChance) {
        item.orphaned = true;
        this.orphaned++;
        this.orphanedTotalSize += item.tx.data ? item.tx.data.byteLength : 0;
        this.log(`Randomly orhpaned TX: ${id} when it had ${item.confirms} confirmations`);
        return { status: 404, confirmed: null };
      }
      return { status: 200, confirmed: { number_of_confirmations: item.confirms } };
    } else {
      return { status: 202, confirmed: null };
    }
  }
}

// A mock target environment that simulates blocks. Not tested or used anywhere.
export class MockEnvironment2 implements TargetEnvironment {
  orphanChance = 0.2;
  oprhanMaxBlocks = 3;

  blockTimeSeconds = 120;

  posted = 0;
  postedTotalSize = 0;
  orphaned = 0;
  orphanedTotalSize = 0;

  postedMap: Record<
    string,
    {
      tx: TransactionParameters;
      confirms: number;
      orphaned: boolean;
    }
  > = {};

  idGen = 97000;

  mining = false;

  async postTransaction(transaction: TransactionParameters): Promise<string> {
    this.posted++;
    this.postedTotalSize += transaction.data ? transaction.data.byteLength : 0;
    const id = `${++this.idGen}`;
    this.postedMap[id] = { tx: transaction, confirms: -1, orphaned: false };
    return id;
  }

  async getStatus(id: string): Promise<{ status: number; confirmed: null | { number_of_confirmations: number } }> {
    const item = this.postedMap[id];
    if (item.orphaned) {
      throw new Error("getStatus() called on orphaned id");
    }

    if (item.confirms >= 0) {
      if (Math.random() < this.orphanChance) {
        item.orphaned = true;
        this.orphaned++;
        this.orphanedTotalSize += item.tx.data ? item.tx.data.byteLength : 0;
        return { status: 404, confirmed: null };
      }
      return { status: 200, confirmed: { number_of_confirmations: item.confirms } };
    } else {
      return { status: 202, confirmed: null };
    }
  }

  // this mineBlocks stuff is not used but would give a more accurate
  // model than TXs having an individual chance of being orphaned every
  // time we go increment their confirms. (which happens in getStatus above)
  async mineBlocks() {
    this.mining = true;

    while (this.mining) {
      await new Promise(res => setTimeout(res, Math.random() * this.blockTimeSeconds));

      var orphanedBlocks = 0;

      if (Math.random() < this.orphanChance) {
        orphanedBlocks = Math.floor(Math.random() * this.oprhanMaxBlocks) + 1;
      }

      for (let key of Object.keys(this.postedMap)) {
        const item = this.postedMap[key];

        if (orphanedBlocks && item.confirms >= 0 && item.confirms <= orphanedBlocks) {
          item.orphaned = true;
          this.orphanedTotalSize += item.tx.data ? item.tx.data.byteLength : 0;
          this.orphaned++;
        } else {
          item.confirms++;
        }
      }
    }
  }

  stopMining() {
    this.mining = false;
  }
}
