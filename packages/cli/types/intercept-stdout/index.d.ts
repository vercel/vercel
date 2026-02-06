declare module 'intercept-stdout' {
  export default function (fn?: InterceptFn): UnhookIntercept;
}

type InterceptFn = (text: string) => string | void;

type UnhookIntercept = () => void;
