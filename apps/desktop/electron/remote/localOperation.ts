export function localOperation<T extends unknown[], R>(mode: "local" | "remote", listener: (...args: T) => R) {
  return (...args: T): R => {
    if (mode === "remote") throw Error("此功能尚未開放多人連線使用，請使用已開放的中央功能");
    return listener(...args);
  };
}
