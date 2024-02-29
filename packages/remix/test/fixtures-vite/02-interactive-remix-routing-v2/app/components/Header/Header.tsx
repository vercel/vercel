import { Link } from "@remix-run/react";
import GithubIcon from "~/components/icons/GithubIcon";
import MoonIcon from "~/components/icons/MoonIcon";
import SunIcon from "~/components/icons/SunIcon";
import RemixLogo from "~/components/RemixLogo";

type Props = {
  toggleDarkMode: () => void;
  isDarkMode: boolean;
};

export default function Header({ toggleDarkMode, isDarkMode }: Props) {
  return (
    <div className="fixed inset-x-0 top-0 h-14 bg-gray-200 border-b-gray-400/25 dark:bg-zinc-800 border-b dark:border-b-zinc-600/25 px-4 flex items-center justify-between">
      <Link className="inline-flex items-end" to="/">
        <RemixLogo />
        <div className="dark:bg-green-900 dark:text-green-200 bg-green-200 text-green-900 rounded-full text-xs font-semibold py-0.5  px-3 ml-1">
          Routing
        </div>
      </Link>
      <div className="inline-flex items-center space-x-3">
        <a
          className="grid place-items-center px-4 rounded-full bg-gray-300 dark:bg-zinc-700 font-semibold py-1"
          href="https://remix-routing-demo.netlify.app"
        >
          Version 1 Demo
        </a>
        <button
          className="w-8 h-8 rounded-full bg-gray-300 dark:bg-zinc-700 grid place-items-center"
          onClick={toggleDarkMode}
        >
          {isDarkMode ? (
            <SunIcon className="w-5 h-5 " />
          ) : (
            <MoonIcon className="w-5 h-5 " />
          )}
        </button>
        <a
          className="w-8 h-8 rounded-full bg-gray-300 dark:bg-zinc-700 grid place-items-center"
          href="https://github.com/dilums/interactive-remix-routing-v2"
        >
          <GithubIcon className="w-6 h-6 " />
        </a>
      </div>
    </div>
  );
}
