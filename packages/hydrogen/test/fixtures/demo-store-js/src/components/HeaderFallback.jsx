export function HeaderFallback({isHome}) {
  const styles = isHome
    ? 'bg-primary/80 dark:bg-contrast/60 text-contrast dark:text-primary shadow-darkHeader'
    : 'bg-contrast/80 text-primary';
  return (
    <header
      role="banner"
      className={`${styles} flex h-nav items-center backdrop-blur-lg z-40 top-0 justify-between w-full leading-none gap-8 px-12 py-8`}
    >
      <div className="flex space-x-4">
        <Box isHome={isHome} />
        <Box isHome={isHome} />
        <Box isHome={isHome} />
        <Box isHome={isHome} />
        <Box isHome={isHome} />
      </div>
      <Box isHome={isHome} wide={true} />
    </header>
  );
}

function Box({wide, isHome}) {
  return (
    <div
      className={`h-6 rounded-sm ${wide ? 'w-32' : 'w-16'} ${
        isHome ? 'bg-primary/60' : 'bg-primary/20'
      }`}
    />
  );
}
