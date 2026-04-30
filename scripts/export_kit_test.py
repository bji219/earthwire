#!/usr/bin/env python3
"""
Export a test drum kit from the /samples page and save the .aif to ~/Desktop.
Adds one Freesound sound and one Xeno-canto sound, then exports.
"""

import os, time, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

DESKTOP = Path.home() / 'Desktop'
OUT_PATH = DESKTOP / 'earthwire_test_export.aif'
URL = 'http://localhost:5173/samples'

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # headed so audio context can start
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f'[{msg.type}] {msg.text}') if msg.type in ('error', 'warning') else None)

        print('[1] Opening /samples …')
        page.goto(URL)
        page.wait_for_load_state('networkidle')
        page.screenshot(path='/tmp/ew_1_loaded.png')
        print('    Loaded.')

        # ── Freesound tab ───────────────────────────────────────────────────
        print('[2] Searching Freesound for "kick drum" …')
        freesound_tab = page.locator('button', has_text='Freesound')
        freesound_tab.click()
        page.wait_for_timeout(500)

        page.locator('.freesound-tab .search-bar input[placeholder*="Search"]').fill('kick drum')
        page.locator('.freesound-tab .search-bar button', has_text='Search').click()

        page.wait_for_selector('.freesound-tab .result-item', timeout=15000)
        results = page.locator('.freesound-tab .result-item')
        count = results.count()
        print(f'    {count} results found.')
        page.screenshot(path='/tmp/ew_2_freesound_results.png')

        # Click the first "Add" button
        add_btn = results.nth(0).locator('.add-btn')
        print('[3] Clicking "+ Add" on first result …')
        add_btn.click()
        page.wait_for_timeout(3000)  # give time for fetch + decode
        page.screenshot(path='/tmp/ew_3_after_add.png')
        print('    Added to slot 0.')

        # ── Xeno-canto tab ──────────────────────────────────────────────────
        print('[4] Searching Xeno-canto for "nightingale" …')
        xc_tab = page.locator('button', has_text='Xeno-canto')
        xc_tab.click()
        page.wait_for_timeout(500)

        page.locator('.xeno-tab .search-bar input[placeholder*="Species"]').fill('nightingale')
        page.locator('.xeno-tab .search-bar button', has_text='Search').click()

        page.wait_for_selector('.xeno-tab .result-item', timeout=15000)
        xc_results = page.locator('.xeno-tab .result-item')
        xc_count = xc_results.count()
        print(f'    {xc_count} results found.')
        page.screenshot(path='/tmp/ew_4_xc_results.png')

        xc_add = xc_results.nth(0).locator('.add-btn')
        print('[5] Clicking "+ Add" on first Xeno-canto result …')
        xc_add.click()
        page.wait_for_timeout(4000)
        page.screenshot(path='/tmp/ew_5_after_xc_add.png')
        print('    Added to slot 1.')

        # ── Export ──────────────────────────────────────────────────────────
        print('[6] Clicking "export kit →" …')
        with page.expect_download(timeout=30000) as dl_info:
            page.locator('.export-btn').click()

        download = dl_info.value
        download.save_as(str(OUT_PATH))
        size = OUT_PATH.stat().st_size
        print(f'    Download saved: {OUT_PATH}')
        print(f'    File size: {size:,} bytes ({size/1024:.1f} KB)')

        # ── Console errors ──────────────────────────────────────────────────
        if console_errors:
            print('\nConsole errors/warnings:')
            for e in console_errors:
                print(f'  {e}')
        else:
            print('\nNo console errors or warnings.')

        page.screenshot(path='/tmp/ew_6_after_export.png')
        browser.close()

    print('\nDone. Screenshots saved to /tmp/ew_*.png')
    print(f'AIF file: {OUT_PATH}')

if __name__ == '__main__':
    run()
