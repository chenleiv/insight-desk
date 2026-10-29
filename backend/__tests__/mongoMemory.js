import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";

// mongod creates a unix socket in /tmp by default, which the Claude Code sandbox blocks.
// Tests only connect over TCP, so the socket is not needed.
const args = ["--nounixsocket"];

export function startMongoServer() {
  return MongoMemoryServer.create({ instance: { args } });
}

export function startMongoReplSet(replSet) {
  return MongoMemoryReplSet.create({ replSet, instanceOpts: [{ args }] });
}
