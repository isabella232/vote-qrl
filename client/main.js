import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import validate from '@theqrl/validate-qrl-address';
import yaml from 'yaml';

import './main.html';

const toggleAffix = (affixElement, scrollElement, wrapper) => {
  const height = affixElement.outerHeight();
  const top = wrapper.offset().top; // eslint-disable-line

  if (scrollElement.scrollTop() >= top) {
    wrapper.height(height);
    affixElement.addClass('bg-white');
  } else {
    affixElement.removeClass('bg-white');
    wrapper.height('auto');
  }
};

/* use toggleAffix on any data-toggle="affix" elements */
$('[data-toggle="bg-white"]').each(() => {
  const ele = $(this);
  const wrapper = $('<div></div>');

  ele.before(wrapper);
  $(window).on('scroll resize', () => {
    toggleAffix(ele, $(this), wrapper);
  });

  toggleAffix(ele, $(window), wrapper);
});

$(window).scroll(() => {
  if ($(document).scrollTop() > 80 && window.innerWidth > 767) {
    $('.navbar').addClass('bg-white');
    $('#navbar').animate(
      { height: '120' },
      {
        queue: false,
        duration: 500,
      }
    );
    $('#navlogo').animate(
      { height: '100' },
      {
        queue: false,
        duration: 500,
      }
    );
    if ($('#hiddenVote').hasClass('invisible')) {
      $('#hiddenVote').hide();
      $('#hiddenVote').removeClass('invisible');
      $('#hiddenVote').show('slow');
    }
  } else {
    $('.navbar').removeClass('bg-white');
    $('#navbar').animate(
      { height: '181' },
      {
        queue: false,
        duration: 500,
      }
    );
    $('#navlogo').animate(
      { height: '165' },
      {
        queue: false,
        duration: 500,
      }
    );
    $('#hiddenVote').hide();
    $('#hiddenVote').addClass('invisible');
  }
});

Template.main.onCreated(function mainOnCreated() {
  Session.set('loadingCheck', 0);
});

Template.vote.onCreated(function voteOnCreated() {
  // counter starts at 0
  Session.set('qrlAddress', '');
  Session.set('error', '');
  Session.set('voteStatus', '');
  Session.set('activeVote', '');
  Session.set('quantaTotal', '');
  Session.set('quantaVoted', '');
  Session.set('counts', []);
  Session.set('votingActive', '');
  Session.set('quantaCounts', []);
  Meteor.call('getVoteInfo', (error, result) => {
    console.log({ error, result });
    if (!error) {
      result.YAMLoptions = [];
      result.options.forEach((element) => {
        console.log('element:', element);
        result.YAMLoptions.push(yaml.stringify(element.data));
      });
      console.log('yaml', result.YAMLoptions);
      Session.set('activeVote', result);
      let lc = Session.get('loadingCheck');
      lc += 1;
      Session.set('loadingCheck', lc);
    }
  });
  Meteor.call('quantaTotal', (error, result) => {
    if (!error) {
      Session.set('quantaTotal', result);
    } else {
      console.log('Error getting quantaTotal: ', error);
    }
  });
  Meteor.call('quantaVoted', (error, result) => {
    if (!error) {
      console.log('Total voted: ' + result);
      Session.set('quantaVoted', result);
    } else {
      console.log('Error getting voted total', error);
    }
  });
  Meteor.call('counts', (error, result) => {
    if (!error) {
      console.log('Counts: ', result);
      Session.set('counts', result);
    } else {
      console.log('Error getting counts', error);
    }
  });
  Meteor.call('quantaCounts', (error, result) => {
    if (!error) {
      console.log('Quanta Counts: ', result);
      Session.set('quantaCounts', result);
    } else {
      console.log('Error getting Quanta counts', error);
    }
  });
  Meteor.call('votingActive', (error, result) => {
    if (!error) {
      Session.set('votingActive', result);
      console.log(Blaze._parentData);
      let lc = Session.get('loadingCheck');
      lc += 1;
      Session.set('loadingCheck', lc);
    } else {
      console.log('Error getting active vote status', error);
    }
  });
});

Template.main.helpers({
  doLoadingCheck() {
    const lc = Session.get('loadingCheck');
    console.log({ lc });
    if (lc > 1) {
      return false;
    }
    return true;
  },
});

Template.vote.helpers({
  qrlAddress() {
    return Session.get('qrlAddress');
  },
  error() {
    return Session.get('error');
  },
  voteStatus() {
    return Session.get('voteStatus');
  },
  info() {
    return Session.get('activeVote');
  },
  addOne(index) {
    return index + 1;
  },
  readHash(index) {
    return Session.get('activeVote').options[index].hash;
  },
  quantaTotal() {
    return Session.get('quantaTotal');
  },
  quantaVoted() {
    return Session.get('quantaVoted');
  },
  votingActive() {
    return Session.get('votingActive');
  },
  votes(index) {
    return Session.get('counts')[index];
  },
  quantaVotes(index) {
    return Session.get('quantaCounts')[index];
  },
  txhash() {
    return Session.get('txhash');
  },
  percentComplete() {
    const x = Session.get('quantaVoted');
    const y = Session.get('quantaTotal');
    try {
      const r = ((x / y) * 100).toFixed(3);
      if (!isNaN(r)) {
        return r;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  },
  lessVote(text) {
    return text.split('vote:')[1];
  },
});

Template.vote.events({
  'click #submit'(event, instance) {
    event.preventDefault();
    const address = document.getElementById('inputtedAddress').value;
    if (validate.hexString(address).result) {
      Session.set('error', '');
      Session.set('qrlAddress', address);
      Meteor.call('getVoteStatus', address, (error, result) => {
        console.log({ error, result });
        if (error) {
          Session.set('error', 'Error checking vote status: ' + error.message);
        } else {
          Session.set('voteStatus', result.message);
          Session.set('txhash', result.txhash);
        }
      });
    } else {
      Session.set('error', 'Invalid QRL address');
    }
  },
  'click #reset'(event, instance) {
    event.preventDefault();
    Session.set('voteStatus', '');
    Session.set('error', '');
    Session.set('qrlAddress', '');
    Session.set('txhash', '');
  },
});

Template.admin.events({
  'click #upload'(event, instance) {
    const password = document.getElementById('password').value;
    let csv = document.getElementById('csv').value;
    csv = csv.split('\n');
    const filtered = [];
    csv.forEach((element) => {
      if (validate.hexString(element.split(',')[0]).result) {
        filtered.push(element.split(','));
      }
    });
    csv = filtered;
    console.log({ password, csv });
    if (csv.length > 0) {
      console.log('Sending CSV to server...');
      Meteor.call('csv', password, csv, (error, result) => {
        console.log({ error, result });
      });
    }
  },
  'click #doJumpBlock'(event, instance) {
    const password = document.getElementById('password').value;
    const block = parseInt(document.getElementById('jumpBlock').value, 10);
    Meteor.call('setCurrent', password, block, (error, result) => {
      console.log({ error, result });
    });
  },
  'click #activate'(event, instance) {
    const password = document.getElementById('password').value;
    Meteor.call('activityUpdate', password, true, (error, result) => {
      console.log({ error, result });
    });
  },
  'click #deactivate'(event, instance) {
    const password = document.getElementById('password').value;
    Meteor.call('activityUpdate', password, false, (error, result) => {
      console.log({ error, result });
    });
  },
});
