declare type TextParams = {
  label: string;
  initialValue?: string;
  valid?: boolean;
  // Can be:
  // - `false`, which does nothing
  // - `cc`, for credit cards
  // - `date`, for dates in the mm / yyyy format
  mask?: boolean | 'cc' | 'date';
  placeholder?: string;
  abortSequences?: Set<string>;
  eraseSequences?: Set<string>;
  resolveChars?: Set<string>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  // Char to print before resolving/rejecting the promise
  // If `false`, nothing will be printed
  trailing?: (arg: number) => string;
  // Gets called on each keypress;
  // `data` contains the current keypress;
  // `futureValue` contains the current value + the
  // Keypress in the correct place
  validateKeypress?: (data: any, futureValue: string) => boolean; // eslint-disable-line no-unused-vars
  // Get's called before the promise is resolved
  // Returning `false` here will prevent the user from submiting the value
  validateValue?: (data: string) => boolean; // eslint-disable-line no-unused-vars
  // Receives the value of the input and should return a string
  // Or false if no autocomplion is available
  autoComplete?: (value: string) => boolean; // eslint-disable-line no-unused-vars
  // Tab
  // Right arrow
  autoCompleteChars?: Set<string>;
  // If true, converts everything the user types to to lowercase
  forceLowerCase?: boolean;
};

export default function(params: TextParams): Promise<string>;
