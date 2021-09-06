import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';

const Votes = new Mongo.Collection('votes');

Meteor.startup(() => {
  // code to run on server at startup
});

Meteor.methods({
  getVoteStatus(address) {
    check(address, String);
    console.log({address});
    const lookup = Votes.findOne({address});
    if (lookup) {
      if (lookup.status) {
        return lookup.status
      } else {
        return {code: 0, message: 'Eligible to vote, no ballot generation requested'}
      }
    } else {
      return 'Address did not have QRL balance at [SNAPSHOT DATE]'
    }
  },
  csv(password, csv) {
    check(password, String);
    check(csv, Array);
    if (password !== 'test') {
      throw new Meteor.Error('Bad password');
    }
    let dupes = 0;
    let inserted = 0;
    csv.forEach(element => {
      if (Votes.findOne({address: element[0]})) {
        dupes += 1;
      } else {
        Votes.insert({address: element[0], snapshotBalance: element[1]});
        inserted += 1;
      }
    });
    return {dupes, inserted}
  }
})