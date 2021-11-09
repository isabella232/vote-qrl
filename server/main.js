import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { createHash } from 'crypto';
import axios from 'axios';

const sha512Truncated = function (data) {
  const hash = createHash('sha512');
  hash.update(data);
  return hash.digest('hex').slice(0, 32);
};

const Votes = new Mongo.Collection('votes');
const Index = new Mongo.Collection('index');
const Tally = new Mongo.Collection('tally');

const { adminPass } = Meteor.settings;
let ACTIVE = true;


const VOTE_ID_DATA = Meteor.settings.vote;

const OPTIONS = Meteor.settings.options;
if (OPTIONS === undefined) {
  console.log('FATAL: App started without required configuration file - please see documentation');
  process.exit(1);
}
console.log('OPTIONS:');
console.log(OPTIONS);

let CURRENT = 0;
let INDEXING = false;
let COUNTS = [];
let QUANTACOUNTS = [];
let clear = null;
let indexInterval = null;

OPTIONS.forEach((element, index) => {
  OPTIONS[index].hash = sha512Truncated(JSON.stringify(element.data));
});

const VOTE_ID_HASH = sha512Truncated(JSON.stringify(VOTE_ID_DATA));

let quantaTotal = 0;
const voteTally = Tally.findOne({});
if (voteTally) {
  console.log('Recalled total voting quanta');
  quantaTotal = voteTally.quantaTotal;
} else {
  Votes.find().forEach((element) => {
    quantaTotal += parseInt(element.snapshotBalance, 10);
  });
  Tally.insert({quantaTotal, options: OPTIONS, voted: 0});
  console.log('Stored voting quanta');
}

console.log(`Snapshot total Quanta: ${quantaTotal}`);
console.log(VOTE_ID_HASH);

function doCount(options) {
  const arr = [];
  options.forEach(element => {
    arr.push(Votes.find({ status: element.hash }).fetch().length);
  });
  return arr;
}

function doQuantaCount(options) {
  const arr = [];
  options.forEach((element) => {
    const opt = Votes.find({ status: element.hash }).fetch();
    let sum = 0;
    if (opt.length > 0) {
      opt.forEach(addr => {
        sum += parseInt(addr.snapshotBalance, 10);
      });
    }
    arr.push(sum);
  });
  return arr;
}

COUNTS = doCount(OPTIONS);
QUANTACOUNTS = doQuantaCount(OPTIONS);

function getBlock(block) {
  try {
    console.log('Requesting block: ' + block);
    axios
      .post('https://zeus-proxy.automated.theqrl.org/grpc/mainnet/GetObject', {
        query: block.toString(),
      })
      .then((response) => {
        if (!response.data.found) {
          console.log('ERROR: Block ' + block + ' not found!');
          Meteor.clearInterval(indexInterval);
          INDEXING = false;
          return false;
        } else {
          if (response.data.block_extended.extended_transactions.length > 1) {
            response.data.block_extended.extended_transactions.forEach(
              (element) => {
                if (element.tx.transactionType === 'message') {
                  const message = Buffer.from(
                    element.tx.message.message_hash
                  ).toString();
                  console.log(`Message found: ${message}`);
                  if (
                    message.slice(0, 8).toLowerCase() === '0f0f0004' &&
                    message.length === 72
                  ) {
                    console.log('This is a valid vote message');
                    const electionID = message.slice(8, 40);
                    const choiceID = message.slice(40, 72);
                    console.log({ electionID, choiceID });
                    let matchThis = false;
                    OPTIONS.forEach((element) => {
                      if (element.hash === choiceID) {
                        matchThis = true;
                      }
                    });
                    if (matchThis && electionID === VOTE_ID_HASH) {
                      console.log('Valid vote message is for active vote');
                      // TODO: check who from
                      const txhash = Buffer.from(
                        element.tx.transaction_hash
                      ).toString('hex');
                      axios
                        .post(
                          'https://zeus-proxy.automated.theqrl.org/grpc/mainnet/GetObject',
                          {
                            query: txhash,
                          }
                        )
                        .then((txResponse) => {
                          const txhash = Buffer.from(
                            txResponse.data.transaction.tx.transaction_hash
                          ).toString('hex');
                          const voteFrom =
                            'Q' +
                            Buffer.from(
                              txResponse.data.transaction.addr_from
                            ).toString('hex');
                          const lookup = Votes.findOne({ address: voteFrom });
                          if (lookup) {
                            if (lookup.status) {
                              console.log(
                                'Vote from ' +
                                  voteFrom +
                                  ' has already been recorded'
                              );
                            } else {
                              console.log('Okay to record vote...');
                              Votes.update(
                                { address: voteFrom },
                                { $set: { status: choiceID, txHash: txhash } }
                              );
                              console.log(
                                'Weight of vote: ' + lookup.snapshotBalance
                              );
                              const toInc = parseInt(
                                lookup.snapshotBalance,
                                10
                              );
                              Tally.upsert({}, { $inc: { voted: toInc } });
                              COUNTS = doCount(OPTIONS);
                              QUANTACOUNTS = doQuantaCount(OPTIONS);
                              console.log('Vote recorded & count updated');
                            }
                          } else {
                            console.log(
                              'Address ' +
                                voteFrom +
                                ' was not included in snapshot and is ineligible to vote'
                            );
                          }
                        })
                        .catch((err) => {
                          console.log('Error getting transaction: ' + err);
                          INDEXING = false;
                        });
                    } else {
                      console.log(
                        'Vote was for a different election (electionID hash does not match)'
                      );
                    }
                  }
                }
              }
            );
          }
          CURRENT += 1;
        }
      })
      .catch((err) => {
        console.log('Error getting transaction: ' + err);
        INDEXING = false;
        Meteor.clearInterval(indexInterval);
      });
  } catch (e) {
    // error getting block - stop indexing & recheck later (timer) 
    console.log('Error making API calls with block ' + block);
    INDEXING = false;
    Meteor.clearInterval(indexInterval);
  }
}

function indexBlocks(from) {
  try {
    if (INDEXING) {
      axios
        .get('https://zeus-proxy.automated.theqrl.org/grpc/mainnet/GetStats')
        .then((response) => {
          const to = parseInt(response.data.node_info.block_height);
          if (from === to) {
            console.log('Parser up to date');
            INDEXING = false;
            return;
          }
          if (from > to) {
            console.log(
              'ERROR: parser height greater than current blockheight'
            );
            Index.upsert({}, { block: to });
            INDEXING = false;
            return;
          }
          if (to > from) {
            console.log(`Parsing blocks ${from} - ${to}`);
            CURRENT = from;
            indexInterval = Meteor.setInterval(function () {
              if (CURRENT > to) {
                INDEXING = false;
              } else {
                if (getBlock(CURRENT)) {
                  Index.upsert({}, { block: CURRENT });
                }
              }
            }, 5000);
            clear = Meteor.setInterval(function () {
              if (CURRENT > to) {
                INDEXING = false;
                console.log('Block parsing complete');
                Meteor.clearInterval(indexInterval);
              }
            }, 5000);
          } else {
            INDEXING = false;
          }
        })
        .catch((err) => {
          console.log('Error getting transaction: ' + err);
          INDEXING = false;
          Meteor.clearInterval(indexInterval);
        });
    }
  } catch(e) {
    // error, defer indexing
    console.log('Error doing GetStats API call');
    INDEXING = false;
    Meteor.clearInterval(indexInterval);
  }
}

Meteor.startup(() => {
  // code to run on server at startup
  INDEXING = false;
  let starting = VOTE_ID_DATA.blockheight;
  const indexStatus = Index.findOne() || { block: 0 };
  if (indexStatus.block > starting) {
    console.log(`Block parser cache is up to ${indexStatus.block} for vote starting at ${starting}`);
    starting = indexStatus.block;
  }
  if (starting > indexStatus.block) {
    Index.upsert({}, { block: starting });
  }
  // timer to check if indexing and restart if not
  Meteor.setInterval(() => {
    if (INDEXING === false) {
      Meteor.clearInterval(clear);
      console.log('Rechecking indexing');
      INDEXING = true;
      const indexStatusLoop = Index.findOne();
      if (indexStatusLoop.block > VOTE_ID_DATA.blockheight) {
        console.log(
          `Block parser cache is up to ${indexStatusLoop.block} for vote starting at ${VOTE_ID_DATA.blockheight}`
        );
        starting = indexStatusLoop.block;
      }
      CURRENT = starting;
      indexBlocks(starting);
    } else {
      console.log('Indexing still underway');
    }
  }, 20000);
});

Meteor.methods({
  votingActive() {
    return ACTIVE;
  },
  getVoteStatus(address) {
    check(address, String);
    const lookup = Votes.findOne({ address });
    if (lookup) {
      if (lookup.status) {
        let voteText = 'Invalid vote option recorded';
        OPTIONS.forEach((element) => {
          if (element.hash === lookup.status) {
            voteText = `Vote successfully recorded: ${element.data.vote}`;
          }
        });
        return { code: 1, message: voteText, txhash: lookup.txHash };
      } else {
        // should also check here if voted
        return { code: 0, message: 'Eligible to vote, has not yet voted' };
      }
    } else {
      return {
        code: -1,
        message: `Address did not have QRL balance reaching the threshold to vote at blockheight ${VOTE_ID_DATA.blockheight}`,
      };
    }
  },
  checkPass(password) {
    check(password, String);
    return (password === adminPass);
  },
  csv(password, csv) {
    check(password, String);
    check(csv, Array);
    if (password !== adminPass) {
      throw new Meteor.Error('Bad password');      
    }
    let dupes = 0;
    let inserted = 0;
    csv.forEach((element) => {
      if (Votes.findOne({ address: element[0] })) {
        dupes += 1;
      } else {
        Votes.insert({ address: element[0], snapshotBalance: element[1] });
        inserted += 1;
      }
    });
    console.log(`CSV results: [${inserted}] inserted, [${dupes}] dupes`);
    quantaTotal = 0;
    Votes.find().forEach((element) => {
      quantaTotal += parseInt(element.snapshotBalance, 10);
    });
    const tally = Tally.findOne({});
    Tally.upsert({}, { quantaTotal, options: OPTIONS, voted: tally.voted });
    console.log('Stored voting quanta');
    return { dupes, inserted };
  },
  getVoteInfo() {
    return { id: VOTE_ID_DATA, hash: VOTE_ID_HASH, options: OPTIONS };
  },
  quantaTotal() {
    return quantaTotal;
  },
  quantaVoted() {
    const tally = Tally.findOne({});
    if (tally.voted) {
      return tally.voted;
    } else {
      return 0;
    }
  },
  counts() {
    return COUNTS;
  },
  quantaCounts() {
    return QUANTACOUNTS;
  },
  setCurrent(password, current) {
    check(password, String);
    check(current, Number);
    if (password !== adminPass) {
      throw new Meteor.Error('Bad password');      
    }
    CURRENT = current;
    Index.upsert({}, { block: current });
    if (INDEXING) {
      Meteor.clearInterval(indexInterval);
      INDEXING = false;
    }
  },
  clear(password) {
    check(password, String);
    if (password !== adminPass) {
      throw new Meteor.Error('Bad password');      
    }
    Index.remove({});
    Votes.remove({});
    Tally.remove({});
  },
  getVotes(password) {
    check(password, String);
    if (password !== adminPass) {
      throw new Meteor.Error('Bad password');      
    }
    return Votes.find({}).fetch();
  },
  activityUpdate(password, bool) {
    check(password, String);
    check(bool, Boolean);
    if (password !== adminPass) {
      throw new Meteor.Error('Bad password');
    }
    ACTIVE = bool;
  },
});
