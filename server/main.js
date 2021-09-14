import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { createHash } from 'crypto';
import { stringify } from 'querystring';
import axios from 'axios';

const sha512Truncated = function (data) {
  const hash = createHash('sha512');
  hash.update(data);
  return hash.digest('hex').slice(0, 32);
};

const Votes = new Mongo.Collection('votes');
const Index = new Mongo.Collection('index');

const VOTE_ID_DATA = {
  active: true,
  blockheight: 812979,
  originator: 'The QRL Contributors',
  title: 'QIP15',
  eligibility: 'Balance > 1 Quanta',
};

const OPTIONS = [
  {
    data: {
      vote: 'APPROVE QIP15',
    },
    hash: null,
  },
  {
    data: {
      vote: 'REJECT QIP15',
    },
    hash: null,
  },
];

let CURRENT = 0;
let INDEXING = false;
let clear = null;
let indexInterval = null;

OPTIONS.forEach((element, index) => {
  OPTIONS[index].hash = sha512Truncated(JSON.stringify(element.data));
});

const VOTE_ID_HASH = sha512Truncated(JSON.stringify(VOTE_ID_DATA));

let quantaTotal = 0;
Votes.find().forEach((element) => {
  quantaTotal += parseInt(element.snapshotBalance, 10);
});

console.log(`Snapshot total Quanta: ${quantaTotal}`);
console.log(VOTE_ID_HASH);

function checkBlock(block) {}

function getBlock(block) {
  console.log('Requesting block: ' + block);
  axios
    .post('https://zeus-proxy.automated.theqrl.org/grpc/testnet/GetObject', {
      query: block.toString(),
    })
    .then((response) => {
      if (!response.data.found) {
        console.log('ERROR: Block ' + block + ' not found!');
      } else {
        CURRENT += 1;
        if (response.data.block_extended.extended_transactions.length > 1) {
          response.data.block_extended.extended_transactions.forEach((element) => {
            if (element.tx.transactionType === 'message') {
              const message = Buffer.from(element.tx.message.message_hash).toString();
              console.log(`Message found: ${message}`);
            }
          });
        }
      }
    });
}

function indexBlocks(from) {
  if (INDEXING) {
    axios.get('https://zeus-proxy.automated.theqrl.org/grpc/testnet/GetStats').then((response) => {
      const to = parseInt(response.data.node_info.block_height);
      if (from === to) {
        console.log('Parser up to date');
        INDEXING = false;
        return;
      }
      if (from > to) {
        console.log('ERROR: parser height greater than current blockheight');
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
            getBlock(CURRENT);
            Index.upsert({}, { block: CURRENT });
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
    });
  }
}

Meteor.startup(() => {
  // code to run on server at startup
  INDEXING = true;
  let starting = VOTE_ID_DATA.blockheight;
  const indexStatus = Index.findOne() || {block: 0};
  if (indexStatus.block > starting) {
    console.log(`Block parser cache is up to ${indexStatus.block} for vote starting at ${starting}`);
    starting = indexStatus.block;
  }
  if (starting > indexStatus.block) {
    Index.upsert({}, { block: starting });
  }
  indexBlocks(starting);
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
  getVoteStatus(address) {
    check(address, String);
    const lookup = Votes.findOne({ address });
    if (lookup) {
      if (lookup.status) {
        return lookup.status;
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
  csv(password, csv) {
    check(password, String);
    check(csv, Array);
    if (password !== 'test') {
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
        quantaTotal += parseInt(element[1], 10);
      }
    });
    return { dupes, inserted };
  },
  getVoteInfo() {
    return { id: VOTE_ID_DATA, hash: VOTE_ID_HASH, options: OPTIONS };
  },
  quantaTotal() {
    return quantaTotal;
  },
});
