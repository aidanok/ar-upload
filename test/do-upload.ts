import chai from 'chai' ;

import { doUpload } from '../src';
import { MockSourceEnvironment, MockTargetEnvironment } from './_mock_environments';
import { Upload } from '../src/upload';
import { TxUpload } from '../src/tx-upload';

/**
 * Quick completing tests.
 */

const expect = chai.expect;

describe('doUpload', function() {

  this.timeout('8s');

  it('should correctly update the status of a resumed upload', async () => {
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const itemCount = 30;

    targetEnv.orphanChance = 0;
    
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`random_file_name_${i}.foo`);
    }

    // Do an upload where we will post all TXs immediately, then break from the iteration, 
    // mine some of these pending TXs, and do another single iteration 
    // we should see that we have checked the status of these and moved them into 
    // the correct state. 

    let upload = new Upload(items, { confirmationsRequired: 2, maxPendingBytes: 1024 * 1024 * 400, maxPendingTxs: 100 });

    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break; 
    }

    expect(upload.pending.length).to.eq(itemCount);

    // Serialize
    const serialized = JSON.stringify(upload); 
    
    // While we are serialized,
    // Mine some blocks, orphan a block, mine some more.  
    targetEnv.mineBlock(5);
    targetEnv.orphanBlocks(1);
    targetEnv.mineBlock(10);
    targetEnv.mineBlock(10);
  
    // Mine one more empty block so the first batch of 10 now have 2 confirms. 
    targetEnv.mineBlock(0);
    
    // De-serialize and do a single iteration, our serialized upload with 
    // a list of 30 pending items will be checked and updated. 
    
    upload = Upload.fromJSON(serialized);
    
    expect(upload.pending.length).to.eq(30);
    
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break;
    }

    expect(upload.mined.length).to.eq(10);      // mined but not enough confirmed
    expect(upload.complete.length).to.eq(10);   // mined with 2 confirms. 
    expect(upload.pending.length).to.eq(5);     // these never got mined.
    expect(upload.queued.length).to.eq(5);      // these are the orphaned tx, back in the queue. 
    
    
  })

  it('respect ordering of dependent TXs', async () => {

    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
  
    const items0count = 5;
    let items0: string[] = [];
    for (let i = 0; i < items0count; i++) {
      items0.push(`random_0file_${i}.foo`);
    }

    const items1count = 5;
    let items1: string[] = [];
    for (let i = 0; i < items1count; i++) {
      items1.push(`random_1file_${i}.foo`);
    }

    const items2count = 5;
    let items2: string[] = [];
    for (let i = 0; i < items2count; i++) {
      items2.push(`random_2file_${i}.foo`);
    }

    // Allow 100 txs and 400Mib, and set poll time to very low so we 
    // can we can quickly run a few iterations.
    let upload = new Upload(items0, { pollTime: 0.001, confirmationsRequired: 7, maxPendingBytes: 1024 * 1024 * 400, maxPendingTxs: 100 });

    upload.additems(items1, 1);
    upload.additems(items2, 2);

    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      break; 
    }

    expect(upload.pending.length).to.eq(5);
    expect(upload.queued.length).to.eq(10);

    // Mine 3 txs. 
    targetEnv.mineBlock(3);

    // Do a few iterations 
    let iters = 5;
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      if (--iters === 0) { break }; 
    }

    // We expect no more to be pending since we haven't completed the txs marked as order 0.
    expect(upload.pending.length).to.eq(2);
    expect(upload.mined.length).to.eq(3);
    expect(upload.queued.length).to.eq(10);

    // Mine the remaming 2 blocks marked as order 0. 
    targetEnv.mineBlock(2);

    // Do a few iterations
    iters = 5;
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      if (--iters === 0) { break }; 
    }

    expect(upload.pending.length).to.eq(5);
    expect(upload.mined.length).to.eq(5);
    expect(upload.queued.length).to.eq(5);

    // Mine another 5 TXs, completing the TXs marked as order 1. 
    targetEnv.mineBlock(5);

    // Do a few iterations
    iters = 5;
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      if (--iters === 0) { break }; 
    }

    // All items should be out of the queue and in mining
    expect(upload.pending.length).to.eq(5);
    expect(upload.mined.length).to.eq(10);
    expect(upload.queued.length).to.eq(0);

    // Orphan the last block. This means TXs marked as order 1 are 
    // back in the queue, so TXs marked as 2 should also be back in the 
    // queue. But this is not the case, because they are in the mempool :( 
    targetEnv.orphanBlocks(1); 

    // Do a few iterations
    iters = 1;
    for await (upload of doUpload(sourceEnv, targetEnv, upload)) {
      if (--iters === 0) { break }; 
    }

    expect(upload.mined.length).to.eq(5);
    expect(upload.queued.length).to.eq(10);
    expect(upload.pending.length).to.eq(0);
    

  })
})