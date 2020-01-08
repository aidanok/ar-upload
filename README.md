Ar-Upload
=========

(WIP)

Library to help with posting many transactions and ensure they get confirmed to N confirms
before finishing.

No dependencies on arweave-js or filesystem, the source and target environment
are configured and passed in as configuration, so it can be used in any (JavaScript)
environment (Browser + Arweave-Js, Browser + Extension, NodeJs FS + Arweave-Js, etc)

Other things...

- Rate limits throughput with quota of MB in-flight and TX count in-flight at once
- Waits for a configurable number of confirms before finishing.
- Re-submits TXs that get orphaned before reaching the required number of confirms.
- Async iterator for easy access to progress of upload
- Progress of upload is serializable at each step, allowing for pause/resume/recovery
- Optionally provide a deduplication function that gives an already existing TX Id.
- Can order dependent transactions, so that A is only mined after B, C & D are in a previous block.

Brief example usage:

```typescript

let progress = new Upload(['myfile0.foo', 'myfile1.foo'])

for await (progress of doUpload(sourceEnv, targetEnv, progress)) {
  // print progress and/or save progress, or just do nothing and keep looping until we are done.

  progress.queued    // waiting to be read from source & posted
  progress.pending   // posted and pending in mempool
  progress.mined     // mined with < N confirms
  progress.complete  // mined with >= N confirms

  let serialized = JSON.stringify(progress); // can be written somewhere and de-serialized later.
}

progress.complete // once iteration is done, all items will be in this list with corresponding Tx ids, other lists will be empty.

```

To run a sample, simulation with mock source and target environments and sped up time:

```bash
export DEBUG="mock-env:*" # Debug messages about the mock env (simulated orphaned blocks)
npx ts-node examples/example0.ts

```

```bash
export DEBUG="mock-env:*,do-upload:*" # More verbose debug messages about the queing & progress too.
npm run test
```

NOTE: The only environments included at the moment are some mock environments for testing, the mock target environment randomly orphans blocks, the mock source environment just provides a randomly sized chunk of bytes
when asked for any filename/identifier.

