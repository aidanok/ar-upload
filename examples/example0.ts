import { multiUpload } from "../src/main";
import { MockSourceEnvironment, MockTargetEnvironment } from "../test/_mock_environments";

import colors from "colors";
import { DEFAULT_OPTIONS } from "../src/options";

async function runDemo() {
  const sourceEnv = new MockSourceEnvironment();
  const targetEnv = new MockTargetEnvironment();
  const options = Object.assign({}, DEFAULT_OPTIONS);

  const timeScale = 0.1;
  const itemCount = 20;

  // Make things move a bit faster for demo.
  options.pollTime = options.pollTime * timeScale;
  targetEnv.blockTimeSeconds = targetEnv.blockTimeSeconds * timeScale;

  // Set up some random files, the MockSourceEnvironment just gives 
  // some random bytes for any identifier.
  const randomFiles: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    randomFiles.push(`random_file_${i}.bin`);
  }

  console.log(colors.cyan(`Simulating ${itemCount} TXs with random sizes`));
  console.log(colors.cyan(`Waiting for ${options.confirmationsRequired} confirms`));
  console.log(colors.cyan(`Maximum of ${(options.maxPendingBytes / 1024 / 1024).toFixed(2)}MiB in-flight at once`));

  for await (const progress of multiUpload(sourceEnv, targetEnv, randomFiles, options)) {
    
    // Print some info.
    const ql = colors.cyan(progress.queued.length.toString());
    const pl = colors.grey(progress.pending.length.toString());
    const ml = colors.green.dim(progress.mined.length.toString());
    const cl = colors.green(progress.confirmed.length.toString());

    const pendingBytes = progress.pending.reduce((total, txp) => (total += txp.byteSize), 0);
    const pendingMb = (pendingBytes / 1024 / 1024).toFixed(2);
    
    console.log(`Queued:${ql}, Pending:${pl} (${pendingMb} MiB), Mined:${ml}, Fully Confirmed:${cl}`);
  }
}

runDemo();
