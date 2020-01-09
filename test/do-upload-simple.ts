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
  it('should correctly update the status of a resumed upload', async () => {
    const sourceEnv = new MockSourceEnvironment();
    const targetEnv = new MockTargetEnvironment(); 
    
    const timeScale = 0.0125;
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
    
   
    // De-serialize
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
})