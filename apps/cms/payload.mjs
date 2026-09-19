// Resolve the CLI from this workspace whether npm hoists Payload or nests it.
await import(new URL("../bin.js", import.meta.resolve("payload")));
