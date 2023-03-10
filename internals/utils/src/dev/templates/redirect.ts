import encodeHTML from 'escape-html';

interface Inputs {
  statusCode: number;
  location: string;
}

export default function redirect(it: Inputs): string {
    let out =
      '<!doctype html><!-- https://now.sh --><h1>Redirecting (' +
      it.statusCode +
      ')</h1><a>' +
      encodeHTML(it.location) +
      '</a>';
    return out;
  }