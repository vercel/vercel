import clsx from 'clsx';
import {Link} from '@shopify/hydrogen';

import {missingClass} from '~/lib/utils';

export function Button({
  as = 'button',
  className = '',
  variant = 'primary',
  width = 'auto',
  ...props
}: {
  as?: React.ElementType;
  className?: string;
  variant?: 'primary' | 'secondary' | 'inline';
  width?: 'auto' | 'full';
  [key: string]: any;
}) {
  const Component = props?.to ? Link : as;

  const baseButtonClasses =
    'inline-block rounded font-medium text-center py-3 px-6';

  const variants = {
    primary: `${baseButtonClasses} bg-primary text-contrast`,
    secondary: `${baseButtonClasses} border border-primary/10 bg-contrast text-primary`,
    inline: 'border-b border-primary/10 leading-none pb-1',
  };

  const widths = {
    auto: 'w-auto',
    full: 'w-full',
  };

  const styles = clsx(
    missingClass(className, 'bg-') && variants[variant],
    missingClass(className, 'w-') && widths[width],
    className,
  );

  return <Component className={styles} {...props} />;
}
