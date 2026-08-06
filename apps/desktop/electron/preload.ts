import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("dentflow", {
  version: "0.1.0"
});
