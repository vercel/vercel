import encodeHTML from 'escape-html';

interface Inputs {
  http_status_code: number;
  http_status_description: string;
  error_code?: string;
  request_id: string;
}

export default function error(it: Inputs): string {
    let out = '<main> ';
    if (it.error_code == 'EDGE_FUNCTION_INVOCATION_FAILED') {
      out +=
        ' <p class="error-title error-title-guilty"> <strong>This Edge Function</strong><span> has crashed.</span> </p> ';
    }
    out += ' ';
    if (it.error_code == 'FUNCTION_INVOCATION_FAILED') {
      out +=
        ' <p class="error-title error-title-guilty"> <strong>This Serverless Function</strong><span> has crashed.</span> </p> ';
    }
    out +=
      ' <p class="devinfo-container"> <span class="error-code"><strong>' +
      it.http_status_code +
      '</strong>: ' +
      encodeHTML(it.http_status_description) +
      '</span> ';
    if (it.error_code) {
      out +=
        ' <span class="devinfo-line">Code: <code>' +
        encodeHTML(it.error_code) +
        '</code></span> ';
    }
    out +=
      ' <span class="devinfo-line">ID: <code>' +
      encodeHTML(it.request_id) +
      '</code> </p> <p> <ul> <li> Check the logs in your terminal window to see the application error. </li> </ul> </p></main>';
    return out;
  }