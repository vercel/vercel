declare type TextParams = {
  label: string;
  initialValue?: string;
  valid?: boolean;
  mask?: boolean | 'cc' | 'date';
  placeholder?: string;
  abortSequences?: Set<string>;
  eraseSequences?: Set<string>;
  resolveChars?: Set<string>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  trailing?: (arg: number) => string;
  validateKeypress?: (data: any, futureValue: string) => boolean;
  validateValue?: (data: string) => boolean;
  autoComplete?: (value: string) => boolean;
  autoCompleteChars?: Set<string>;
  forceLowerCase?: boolean;
};

export default function(params: TextParams): Promise<string>;
