import isLeapYear from 'leap-year';

export const config = {
  runtime: 'edge'
}

export default async function handler(req: Request) {
  const data = { isLeapYear: isLeapYear() };
  const json = JSON.stringify(data)

  return new Response(json, {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': '*'
    }
  })
}
