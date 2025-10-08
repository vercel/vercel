type Props = {
  filePath: string;
  children?: React.ReactNode;
};

export default function LayoutWrapper({ filePath, children }: Props) {
  return (
    <div className="relative border dark:border-zinc-400  border-gray-300  rounded-md  px-4 pt-8  pb-4 animated-bg">
      <div className="text-sm absolute left-3 -top-3 h-6 px-3 rounded-md  border dark:border-zinc-400  border-gray-300 tracking-wide animated-bg">
        {filePath}
      </div>
      {children}
    </div>
  );
}
