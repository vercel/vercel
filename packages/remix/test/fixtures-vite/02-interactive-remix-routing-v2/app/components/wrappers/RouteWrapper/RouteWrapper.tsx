type Props = {
  filePath: string;
  children?: React.ReactNode;
};

export default function RouteWrapper({ filePath, children }: Props) {
  return (
    <div className="relative border  rounded-md  p-6 min-h-[96px] dark:border-zinc-400  border-gray-300 animated-bg">
      <div className="text-sm absolute left-3 -top-3 h-6 px-3 rounded-md  border  tracking-wide dark:border-zinc-400 border-gray-300 animated-bg">
        {filePath}
      </div>
      {children}
    </div>
  );
}
