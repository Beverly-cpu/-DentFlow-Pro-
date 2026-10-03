import assert from "node:assert/strict";
import test from "node:test";
import { getDeploymentConfig } from "../electron/remote/serverConnection";

function withEnv(values: Record<string,string|undefined>, fn:()=>void) {
  const old = Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  try { for (const [k,v] of Object.entries(values)) v===undefined ? delete process.env[k] : process.env[k]=v; fn(); }
  finally { for (const [k,v] of Object.entries(old)) v===undefined ? delete process.env[k] : process.env[k]=v; }
}

test("production remote mode fails closed without a server URL",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:"1",DENTFLOW_SERVER_URL:undefined},()=>assert.throws(()=>getDeploymentConfig(),/DENTFLOW_SERVER_URL/)));
test("production remote mode accepts HTTPS central server",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:"1",DENTFLOW_SERVER_URL:"https://dentflow.example.test"},()=>assert.equal(getDeploymentConfig().mode,"remote")));
test("remote server rejects insecure non-local HTTP",()=>withEnv({DENTFLOW_REQUIRE_REMOTE:undefined,DENTFLOW_SERVER_URL:"http://dentflow.example.test"},()=>assert.throws(()=>getDeploymentConfig(),/HTTPS/)));
