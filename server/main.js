import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { createHash } from 'crypto';
import { stringify } from 'querystring';

const sha512Truncated = function(data) {
  const hash = createHash('sha512');
  hash.update(data);
  return hash.digest('hex').slice(0, 32);
}

const Votes = new Mongo.Collection('votes');

const VOTE_ID_DATA = {
  blockheight: 1230,
  originator: 'hello world',
  title: 'QIP15'
}

const OPTIONS = [
  { data: {
      vote: 'APPROVE QIP15'
    },
    hash: null
  },
  { data: {
      vote: 'REJECT QIP15'
    },
    hash: null
  }
]

OPTIONS.forEach((element, index) => {
  OPTIONS[index].hash = sha512Truncated(JSON.stringify(element.data))
});

const VOTE_ID_HASH = sha512Truncated(JSON.stringify(VOTE_ID_DATA))
console.log(VOTE_ID_HASH);

Meteor.startup(() => {
  // code to run on server at startup
});

Meteor.methods({
  getVoteStatus(address) {
    check(address, String);
    const lookup = Votes.findOne({address});
    if (lookup) {
      if (lookup.status) {
        return lookup.status
      } else {
        return {code: 0, message: 'Eligible to vote, has not yet voted' }
      }
    } else {
      return {code: -1, message: 'Address did not have QRL balance at [SNAPSHOT DATE]'}
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
  },
  getVoteInfo() {
    return { id: VOTE_ID_DATA, hash: VOTE_ID_HASH, options: OPTIONS }
  }
})