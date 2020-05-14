import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, async } from '@angular/core/testing';

import { TabsPage } from './tabs-page';

describe('TabsPage', () => {
  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [TabsPage],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();
  }));

  it('should create the tabs page', () => {
    const fixture = TestBed.createComponent(TabsPage);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });
});
