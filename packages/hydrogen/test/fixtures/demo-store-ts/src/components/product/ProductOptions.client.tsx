import {useCallback, useState} from 'react';
// @ts-expect-error @headlessui/react incompatibility with node16 resolution
import {Listbox} from '@headlessui/react';
import {useProductOptions} from '@shopify/hydrogen';

import {Text, IconCheck, IconCaret} from '~/components';

export function ProductOptions({
  values,
  ...props
}: {
  values: any[];
  [key: string]: any;
} & React.ComponentProps<typeof OptionsGrid>) {
  const asDropdown = values.length > 7;

  return asDropdown ? (
    <OptionsDropdown values={values} {...props} />
  ) : (
    <OptionsGrid values={values} {...props} />
  );
}

function OptionsGrid({
  values,
  name,
  handleChange,
}: {
  values: string[];
  name: string;
  handleChange: (name: string, value: string) => void;
}) {
  const {selectedOptions} = useProductOptions();

  return (
    <>
      {values.map((value) => {
        const checked = selectedOptions![name] === value;
        const id = `option-${name}-${value}`;

        return (
          <Text as="label" key={id} htmlFor={id}>
            <input
              className="sr-only"
              type="radio"
              id={id}
              name={`option[${name}]`}
              value={value}
              checked={checked}
              onChange={() => handleChange(name, value)}
            />
            <div
              className={`leading-none py-1 border-b-[1.5px] cursor-pointer transition-all duration-200 ${
                checked ? 'border-primary/50' : 'border-primary/0'
              }`}
            >
              {value}
            </div>
          </Text>
        );
      })}
    </>
  );
}

// TODO: De-dupe UI with CountrySelector
function OptionsDropdown({
  values,
  name,
  handleChange,
}: {
  values: string[];
  name: string;
  handleChange: (name: string, value: string) => void;
}) {
  const [listboxOpen, setListboxOpen] = useState(false);
  const {selectedOptions} = useProductOptions();

  const updateSelectedOption = useCallback(
    (value: string) => {
      handleChange(name, value);
    },
    [name, handleChange],
  );

  return (
    <div className="relative w-full">
      <Listbox onChange={updateSelectedOption} value="">
        {/* @ts-expect-error @headlessui/react incompatibility with node16 resolution */}
        {({open}) => {
          setTimeout(() => setListboxOpen(open));
          return (
            <>
              <Listbox.Button
                className={`flex items-center justify-between w-full py-3 px-4 border border-primary ${
                  open ? 'rounded-b md:rounded-t md:rounded-b-none' : 'rounded'
                }`}
              >
                <span>{selectedOptions![name]}</span>
                <IconCaret direction={open ? 'up' : 'down'} />
              </Listbox.Button>

              <Listbox.Options
                className={`border-primary bg-contrast absolute bottom-12 z-30 grid
                h-48 w-full overflow-y-scroll rounded-t border px-2 py-2 transition-[max-height]
                duration-150 sm:bottom-auto md:rounded-b md:rounded-t-none md:border-t-0 md:border-b ${
                  listboxOpen ? 'max-h-48' : 'max-h-0'
                }`}
              >
                {values.map((value) => {
                  const isSelected = selectedOptions![name] === value;
                  const id = `option-${name}-${value}`;

                  return (
                    <Listbox.Option key={id} value={value}>
                      {/* @ts-expect-error @headlessui/react incompatibility with node16 resolution */}
                      {({active}) => (
                        <div
                          className={`text-primary w-full p-2 transition rounded flex justify-start items-center text-left cursor-pointer ${
                            active ? 'bg-primary/10' : null
                          }`}
                        >
                          {value}
                          {isSelected ? (
                            <span className="ml-2">
                              <IconCheck />
                            </span>
                          ) : null}
                        </div>
                      )}
                    </Listbox.Option>
                  );
                })}
              </Listbox.Options>
            </>
          );
        }}
      </Listbox>
    </div>
  );
}
