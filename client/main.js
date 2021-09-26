import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
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
  if ($(document).scrollTop() > 80) {
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

Template.vote.onCreated(function voteOnCreated() {
  // counter starts at 0
  this.qrlAddress = new ReactiveVar('');
  this.error = new ReactiveVar('');
  this.voteStatus = new ReactiveVar('');
  this.activeVote = new ReactiveVar('loading...');
  this.quantaTotal = new ReactiveVar('');
  this.quantaVoted = new ReactiveVar('');
  this.counts = new ReactiveVar([]);
  this.quantaCounts = new ReactiveVar([]);
  Meteor.call('getVoteInfo', (error, result) => {
    console.log({ error, result });
    if (!error) {
      result.YAMLoptions = [];
      result.options.forEach((element) => {
        console.log('element:', element);
        result.YAMLoptions.push(yaml.stringify(element.data));
      });
      console.log('yaml', result.YAMLoptions);
      this.activeVote.set(result);
    }
  });
  Meteor.call('quantaTotal', (error, result) => {
    if (!error) {
      this.quantaTotal.set(result);
    } else {
      console.log('Error getting quantaTotal: ', error);
    }
  });
  Meteor.call('quantaVoted', (error, result) => {
    if (!error) {
      console.log('Total voted: ' + result);
      this.quantaVoted.set(result);
    } else {
      console.log('Error getting voted total', error);
    }
  });
  Meteor.call('counts', (error, result) => {
    if (!error) {
      console.log('Counts: ', result);
      this.counts.set(result);
    } else {
      console.log('Error getting counts', error);
    }
  });
  Meteor.call('quantaCounts', (error, result) => {
    if (!error) {
      console.log('Quanta Counts: ', result);
      this.quantaCounts.set(result);
    } else {
      console.log('Error getting Quanta counts', error);
    }
  });
});

Template.vote.helpers({
  qrlAddress() {
    return Template.instance().qrlAddress.get();
  },
  error() {
    return Template.instance().error.get();
  },
  voteStatus() {
    return Template.instance().voteStatus.get();
  },
  info() {
    return Template.instance().activeVote.get();
  },
  addOne(index) {
    return index + 1;
  },
  readHash(index) {
    return Template.instance().activeVote.get().options[index].hash;
  },
  quantaTotal() {
    return Template.instance().quantaTotal.get();
  },
  quantaVoted() {
    return Template.instance().quantaVoted.get();
  },
  votes(index) {
    return Template.instance().counts.get()[index];
  },
  quantaVotes(index) {
    return Template.instance().quantaCounts.get()[index];
  },
  percentComplete() {
    const x = Template.instance().quantaVoted.get();
    const y = Template.instance().quantaTotal.get();
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
      instance.error.set('');
      instance.qrlAddress.set(address);
      Meteor.call('getVoteStatus', address, (error, result) => {
        console.log({ error, result });
        if (error) {
          instance.error.set('Error checking vote status: ' + error.message);
        } else {
          // check for match here

          instance.voteStatus.set(result.message);
        }
      });
    } else {
      instance.error.set('Invalid QRL address');
    }
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
});
