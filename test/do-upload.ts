import chai from 'chai' ;

import { doUpload } from '../src';
import { MockSourceEnvironment, MockTargetEnvironment } from './_mock_environments';
import { Upload } from '../src/upload';
import { TxUpload } from '../src/tx-upload';


const expect = chai.expect;

describe('doUpload', function() {
  
  this.timeout(1000*60*500);

  it('should complete with 30 items and never have more than maxPending[bytes|txs] in flight', async () => {
      
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const timeScale = 0.0125;
    const itemCount = 30;
    
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`random_file_name_${i}.foo`);
    }

    let upload = new Upload(items, { maxPendingBytes: 1024 * 1024 * 40, maxPendingTxs: 10});

    // Make things move a bit faster for testing.
    targetEnv.blockTimeSeconds = targetEnv.blockTimeSeconds * timeScale
    upload.pollTime = upload.pollTime * timeScale; 
    
    const asyncIterator = doUpload(sourceEnv, targetEnv, upload); 

    let queued: TxUpload[] = [];
    let pending: TxUpload[] = [];
    let mined: TxUpload[] = [];
    let complete: TxUpload[] = [];  
    let pendingBytes = 0;

    targetEnv.mineBlocks();

    for await ( {queued, pending, mined, complete, pendingBytes } of asyncIterator) {
      expect(pending.length).to.be.lte(upload.maxPendingTxs);
      expect(pendingBytes).to.be.lte(upload.maxPendingBytes);
    }

    expect(queued.length).to.eq(0);
    expect(pending.length).to.eq(0);
    expect(mined.length).to.eq(0);
    expect(complete.length).to.eq(itemCount);
    
    complete.forEach(txupload => expect(txupload.confirmations).to.be.gte(upload.confirmationsRequired));
    
    expect(targetEnv.posted).to.eq(targetEnv.orphanedTxCount + itemCount);

    targetEnv.stopMining();

  })

  it('should complete with 30 items a high orphan rate', async () => {
      
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const timeScale = 0.0125;
    const itemCount = 30;
    
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`random_file_name_${i}.foo`);
    }

    let upload = new Upload(items, { maxPendingBytes: 1024 * 1024 * 40, maxPendingTxs: 10});

    // Make things move a bit faster for testing.
    targetEnv.blockTimeSeconds = targetEnv.blockTimeSeconds * timeScale
    targetEnv.orphanChance = 0.45;
    upload.pollTime = upload.pollTime * timeScale; 
    
    const asyncIterator = doUpload(sourceEnv, targetEnv, upload); 

    let queued: TxUpload[] = [];
    let pending: TxUpload[] = [];
    let mined: TxUpload[] = [];
    let complete: TxUpload[] = [];  
    let pendingBytes = 0;

    targetEnv.mineBlocks();

    for await ( {queued, pending, mined, complete, pendingBytes } of asyncIterator) {
      expect(pending.length).to.be.lte(upload.maxPendingTxs);
      expect(pendingBytes).to.be.lte(upload.maxPendingBytes);
    }

    expect(queued.length).to.eq(0);
    expect(pending.length).to.eq(0);
    expect(mined.length).to.eq(0);
    expect(complete.length).to.eq(itemCount);
    
    expect(targetEnv.posted).to.eq(targetEnv.orphanedTxCount + itemCount);

    complete.forEach(txupload => expect(txupload.confirmations).to.be.gte(upload.confirmationsRequired));
    

    targetEnv.stopMining();

  })

  it('should check the status of a resumed upload', async () => {
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const timeScale = 0.0125;
    const itemCount = 30;
    
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`random_file_name_${i}.foo`);
    }

    let upload = new Upload(items, { maxPendingBytes: 1024 * 1024 * 400, maxPendingTxs: 100 });

    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break; 
    }

    expect(upload.pending.length).to.eq(itemCount);
    

  })

  
})