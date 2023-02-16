import { useParams } from "@remix-run/react";

export default function CatchAll() {
    const params = useParams();
    return <div>{params['*']}</div>;
}
