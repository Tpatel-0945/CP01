# Pocket Ledger

A personal website for tracking your monthly pocket money and savings. Note down every expense with what it was for, and Pocket Ledger turns it into stats, a monthly guide, and cautions about where you spend the most.

## Features

- **Monthly pocket money**: enter what you receive each month, plus extra money like gifts, and how much you want to save.
- **Expense notes**: amount, category, date, reason, need or want, and how you paid. Edit, delete (with undo), search and filter.
- **At a glance**: money in, spent, left, and a safe amount to spend per day for the rest of the month.
- **Stats**: spending by category, spending pace against your saving target, needs vs. wants, spending by weekday, and six months of spent vs. saved. Hover any chart for details.
- **Category limits**: set a limit per category and get warned at 80% and 100%.
- **Guide**: a monthly score plus cautions, such as your top category taking too big a share, spending too fast for your target, too many wants, many small purchases adding up, a category jumping compared with last month, or a single big purchase.
- **Saving goal**: set a long-term goal (e.g. new headphones) and see progress and an estimated time to reach it.
- **Your data stays with you**: everything is saved in your browser's local storage. Download a JSON backup or a CSV of expenses from Settings, and restore from a backup on any device.

The first time you open it, it shows example data so you can see how it works. Click **Clear examples and start fresh** to begin with your own numbers.

## Run it

No install or build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

To put it online for free, enable **GitHub Pages** for this repository (Settings → Pages → deploy from branch, root folder).

## Files

- `index.html`: page structure
- `styles.css`: styles, with light and dark themes
- `app.js`: storage, calculations, charts and insights
