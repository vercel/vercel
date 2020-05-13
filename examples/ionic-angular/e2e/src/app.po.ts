import { browser, by, element, ElementFinder, ExpectedConditions } from 'protractor';

export class AppPage {
  navigateTo() {
    return browser.get('/');
  }

  async getMenu() {
    const el = this.getElement('app-root ion-menu');
    await this.waitForSelector(el);
    return el;
  }

  async getFirstSlide() {
    const el = this.getElement('app-root ion-slides ion-slide:first-child');
    await this.waitForSelector(el);
    return el.getTagName();
  }

  async getRouter() {
    const el = this.getElement('app-root ion-router-outlet');
    await this.waitForSelector(el);
    return el;
  }

  async waitForSelector(el: ElementFinder) {
    return browser.wait(ExpectedConditions.presenceOf(el), 3000);
  }

  getElement(selector) {
    return element(by.css(selector));
  }
}
