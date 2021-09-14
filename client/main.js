import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import validate from '@theqrl/validate-qrl-address';
import yaml from 'yaml';

import './main.html';

Template.vote.onCreated(function voteOnCreated() {
  // counter starts at 0
  this.qrlAddress = new ReactiveVar('');
  this.error = new ReactiveVar('');
  this.voteStatus = new ReactiveVar('');
  this.activeVote = new ReactiveVar('loading...');
  this.quantaTotal = new ReactiveVar('');
  Meteor.call('getVoteInfo', (error, result) => {
    console.log({ error, result });
    if (!error) {
      result.YAMLoptions = [];
      result.options.forEach(element => {
        console.log('element:', element);
        result.YAMLoptions.push(yaml.stringify(element.data));
      });
      console.log('yaml', result.YAMLoptions);
      this.activeVote.set(result)
    }
  });
  Meteor.call('quantaTotal', (error, result) => {
    if (!error) {
      this.quantaTotal.set(result);
    } else {
      console.log('Error getting quantaTotal: ', error);
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
  quantaTotal() {
    console.log('asked..');
    return Template.instance().quantaTotal.get();
  }
});

Template.vote.events({
  'click #submit' (event, instance) {
    const address = document.getElementById('inputtedAddress').value;
    if (validate.hexString(address).result) {
      instance.error.set('');
      instance.qrlAddress.set(address);
      Meteor.call('getVoteStatus', address, (error, result) => {
        console.log({error, result});
        if (error) {
          instance.error.set('Error checking vote status: ' + error.message);
        } else {
          instance.voteStatus.set(result.message);
        }
      })
    } else {
      instance.error.set('Invalid QRL address');
    }
  },
});

Template.admin.events({
  'click #upload' (event, instance) {
    const password = document.getElementById('password').value;
    let csv = document.getElementById('csv').value;
    csv = csv.split('\n');
    const filtered = [];
    csv.forEach(element => {
      if (validate.hexString(element.split(',')[0]).result) {
        filtered.push(element.split(','));
      }
    });
    csv = filtered;
    console.log({password, csv});
    if (csv.length > 0) {
      console.log('Sending CSV to server...');
      Meteor.call('csv', password, csv, (error, result) => {
        console.log({error, result});
      })
    }
  }
})
