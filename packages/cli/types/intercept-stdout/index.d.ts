declare module 'intercept-stdout' {
  export default function (fn?: InterceptFn): UnhookIntercept;
}

interface InterceptFn {
  (text: string): string | void;
}

interface UnhookIntercept {
  (): void;
}
