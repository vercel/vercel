import { render } from '/web_modules/preact.js';
import { useState, useEffect } from "/web_modules/preact/hooks.js";
import { html } from "/web_modules/htm/preact.js";

const CORONA_SUMMARY_BY_COUNTRIES_URL = 'https://api.covid19api.com/summary'

const App = () => {
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    function getCountries() {
      fetch(CORONA_SUMMARY_BY_COUNTRIES_URL)
        .then(res => {
          return res.json();
        })
        .then(data => {
          setCountries(data.Countries.filter((_, idx) => idx > 0));
        });
    }
    
    getCountries();
  }, []);

  return html`
    <table class="striped">
      <caption>COVID19 - Confirmed Cases</caption>
      <thead>
        <tr>
          <th>Country</th>
          <th>Confirmed - New</th>
          <th>Confirmed - Total</th>
          <th>Death - New</th>
          <th>Death - Total</th>
          <th>Recovered - New</th>
          <th>Recovered - Total</th>
        </tr>
      </thead>
      <tbody>
        ${countries.map((country) => {
          return html`
            <tr>
              <td>${country.Country}</td>
              <td>${country.NewConfirmed}</td>
              <td>${country.TotalConfirmed}</td>
              <td>${country.NewDeaths}</td>
              <td>${country.TotalDeaths}</td>
              <td>${country.NewRecovered}</td>
              <td>${country.TotalRecovered}</td>
            </tr>
          `
        })}
      </tbody>
    </table>
  `;
};

render(
  html`
    <${App} />
  `,
  document.querySelector('main')
);
