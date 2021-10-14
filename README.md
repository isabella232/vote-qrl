# vote-qrl

Deployed at <https://vote.theqrl.org>

## Dependencies

NodeJS: <https://nodejs.org/en/>
Meteor: <https://www.meteor.com/developers/install>

## Building

1. Clone repo
2. Create a settings file in cloned directory (see **Settings** section below)
3. ```npm install```
4. ```meteor --settings settings.json```

## Settings

Example ```settings.json``` file:

```json
{
  "vote": {
    "blockheight": 831769,
    "originator": "The QRL Foundation",
    "title": "Test vote - desktop theme",
    "eligibility": "Balance > 1 Quanta",
    "excluded": "Nil",
    "mechanics": "Simple proportional vote",
    "expires": "At end of test period (TBA)"
  },
  "options": [
    {
      "data": {
        "vote": "DARK MODE"
      },
      "hash": null
    },
    {
      "data": {
        "vote": "LIGHT MODE"
      },
      "hash": null
    }
  ],
  "adminPass": "CHANGEME"
}
```