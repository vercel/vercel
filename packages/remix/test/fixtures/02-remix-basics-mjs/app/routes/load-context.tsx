import { json, LoaderFunction } from "@remix-run/server-runtime";

export const loader: LoaderFunction = ({ context }) => {
    return json(context);
}
