import { describe, expect, it } from 'vitest';
import { placeMenu } from '../src/lib/review/menu';

const menu = { width: 180, height: 100 };
const laptop = { left: 0, top: 0, width: 1280, height: 800 };
const phone = { left: 0, top: 0, width: 390, height: 844 };
const column = { left: 16, top: 60, width: 58, height: 400 };
const row = { left: 8, top: 500, width: 374, height: 58 };

describe('placeMenu', () => {
  it('opens to the right of a column rail, level with the button', () => {
    const button = { left: 23, top: 115, width: 44, height: 44 };
    expect(placeMenu(button, column, menu, laptop, 8)).toEqual({ left: 82, top: 115 });
  });
  it('stays inside the bounds at the bottom', () => {
    const button = { left: 23, top: 750, width: 44, height: 44 };
    expect(placeMenu(button, column, menu, laptop, 8)).toEqual({ left: 82, top: 700 });
  });
  it('opens above the button of a row rail', () => {
    const button = { left: 60, top: 507, width: 46, height: 44 };
    expect(placeMenu(button, row, menu, phone, 8)).toEqual({ left: 60, top: 399 });
  });
  it('opens below the button when there is no room above', () => {
    const button = { left: 60, top: 50, width: 46, height: 44 };
    expect(placeMenu(button, { ...row, top: 43 }, menu, phone, 8)).toEqual({ left: 60, top: 102 });
  });
  it('stays inside the bounds on the right', () => {
    const button = { left: 300, top: 507, width: 46, height: 44 };
    expect(placeMenu(button, row, menu, phone, 8)).toEqual({ left: 210, top: 399 });
  });
  it('is relative to the bounds', () => {
    const bounds = { left: 100, top: 50, width: 1280, height: 800 };
    const button = { left: 123, top: 165, width: 44, height: 44 };
    const rail = { left: 116, top: 110, width: 58, height: 400 };
    expect(placeMenu(button, rail, menu, bounds, 8)).toEqual({ left: 82, top: 115 });
  });
});
