import { prompt } from 'inquirer';

export default function login () {
  return new Promise((resolve, reject) => {
    prompt([{ name: 'email', message: 'Enter your email' }], (data) => {

    });
  });
}
