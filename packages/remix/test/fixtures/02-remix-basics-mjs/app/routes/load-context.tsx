import { json, LoaderFunction } from "@remix-run/node";

export const loader: LoaderFunction = ({ context }) => {
    return json(context);
}
