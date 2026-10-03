import assert from "node:assert/strict";
import test from "node:test";
import { getDeploymentConfig } from "../electron/remote/serverConnection";

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function withEnv(values: Record<string,string|undefined>, fn:()=>void) {
  const old = Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  try {
    for (const [key,value] of Object.entries(values)) setEnv(key,value);
    fn();
  } finally {
    for (const [key,value] of Object.entries(old)) setEnv(key,value);
  }
}

test("production remote mode fails closed without a server URL",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:"1",DENTFLOW_SERVER_URL:undefined},()=>assert.throws(()=>getDeploymentConfig(),/DENTFLOW_SERVER_URL/)));
test("production remote mode accepts HTTPS central server",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:"1",DENTFLOW_SERVER_URL:"https://dentflow.example.test"},()=>assert.equal(getDeploymentConfig().mode,"remote")));
test("remote server rejects insecure non-local HTTP",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:undefined,DENTFLOW_SERVER_URL:"http://dentflow.example.test"},()=>assert.throws(()=>getDeploymentConfig(),/HTTPS/)));
