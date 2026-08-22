/* =====================================================================
   Renting a bathroom: the booking lifecycle and the money attached to it.

     requested  guest asks. Nothing is charged, no address is revealed.
     accepted   host says yes → the guest's method is AUTHORISED (a hold,
                not a charge) → guest now sees the address and a 4-digit
                arrival code
     arrived    guest is at the door and gives the code
     completed  host confirms → the hold is CAPTURED → payout is owed to the
                host minus the platform fee → both sides can rate
     declined   host says no → nothing was ever held
     cancelled  either side backs out → the hold is VOIDED, nothing is taken

   Money never moves on the client. The app calls /api/pay/* and the server
   talks to the provider (simulation by default, Stripe if a key is set).
   No card number is ever typed into this app in either mode.
   ===================================================================== */
'use strict';

const Pay = (() => {
  const call = async (name, body) => {
    const res = await fetch(((window.BF_CONFIG && window.BF_CONFIG.apiBase) || '') + '/api/pay/' + name, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body || {})
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'payment failed');
    return json;
  };
  return {
    config:    ()   => call('config'),
    authorize: (b)  => call('authorize', b),
    capture:   (id) => call('capture', {id}),
    void:      (id) => call('void', {id}),
    refund:    (id) => call('refund', {id}),
    get:       (id) => call('get', {id}),
    ledger:    ()   => call('ledger')
  };
})();

/* Simulated payment methods. These are labels, not card numbers — there is
   no field anywhere in this app that accepts a real card. With Stripe keys
   set, this is where Stripe Elements would mount instead.                  */
const PAY_METHODS = [
  {id:'sim_visa',   label:'Visa',       tail:'4242', kind:'card'},
  {id:'sim_mc',     label:'Mastercard', tail:'5454', kind:'card'},
  {id:'sim_wallet', label:'Phone wallet', tail:'',   kind:'wallet'}
];

const Rentals = (() => {

  const code = () => String(Math.floor(1000 + Math.random()*9000));
  const id   = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

  /* store is owned by app.js; these take it as an argument so this file has
     no hidden global state of its own */
  function create(store, listing, {when, note, methodId}){
    const b = {
      id: id('bk'), listingId: listing.id, listingName: listing.name,
      hostName: listing.hostName || 'the host',
      guestName: store.profile.name,
      price: listing.price, currency: listing.currency || '$',
      when: when || 'Right now', note: note || '',
      methodId: methodId || PAY_METHODS[0].id,
      status: 'requested', arrivalCode: null, paymentId: null,
      lat: listing.lat, lng: listing.lng,
      created: Date.now(), events: [{at:Date.now(), type:'requested'}]
    };
    store.bookings.push(b);
    return b;
  }

  async function accept(store, booking){
    if (booking.status !== 'requested') throw new Error('This request is no longer open');
    const payment = await Pay.authorize({
      bookingId: booking.id, amount: booking.price,
      currency: booking.currency === '$' ? 'usd' : 'usd', method: booking.methodId
    });
    booking.paymentId = payment.id;
    booking.fee = payment.fee;
    booking.payout = payment.payout;
    booking.status = 'accepted';
    booking.arrivalCode = code();
    booking.events.push({at:Date.now(), type:'accepted', payment:payment.id});
    return {booking, payment};
  }

  function decline(store, booking, reason){
    if (booking.status !== 'requested') throw new Error('This request is no longer open');
    booking.status = 'declined';
    booking.declineReason = reason || '';
    booking.events.push({at:Date.now(), type:'declined'});
    return booking;
  }

  function arrive(store, booking, given){
    if (booking.status !== 'accepted') throw new Error('This booking is not active');
    if (String(given).trim() !== booking.arrivalCode) return {ok:false, error:'That code does not match'};
    booking.status = 'arrived';
    booking.events.push({at:Date.now(), type:'arrived'});
    return {ok:true};
  }

  async function complete(store, booking){
    if (!['arrived','accepted'].includes(booking.status)) throw new Error('Nothing to complete');
    const payment = await Pay.capture(booking.paymentId);
    booking.status = 'completed';
    booking.receipt = payment.receipt;
    booking.completedAt = Date.now();
    booking.events.push({at:Date.now(), type:'completed', receipt:payment.receipt});
    return {booking, payment};
  }

  async function cancel(store, booking, by){
    if (['completed','cancelled','declined'].includes(booking.status)) throw new Error('Too late to cancel');
    if (booking.paymentId){
      try { await Pay.void(booking.paymentId); }
      catch(e){ console.warn('void failed', e); }
    }
    booking.status = 'cancelled';
    booking.cancelledBy = by;
    booking.events.push({at:Date.now(), type:'cancelled', by});
    return booking;
  }

  function rate(store, booking, side, stars, text){
    booking.ratings = booking.ratings || {};
    booking.ratings[side] = {stars, text, at:Date.now()};
    booking.events.push({at:Date.now(), type:'rated', side});
    return booking;
  }

  /* what the guest is told, by state */
  const GUEST_STATE = {
    requested: {pill:'ask',   label:'Waiting on the host', note:'Nothing has been charged. If they decline, that is the end of it.'},
    accepted:  {pill:'open',  label:'Accepted',            note:'Your payment is on hold, not taken. It is only charged once you are let in.'},
    arrived:   {pill:'open',  label:'You are there',       note:'The host confirms and the payment completes.'},
    completed: {pill:'ghost', label:'Finished',            note:'Payment taken. You can rate the host.'},
    declined:  {pill:'locked',label:'Declined',            note:'Nothing was held and nothing was charged.'},
    cancelled: {pill:'locked',label:'Cancelled',           note:'The hold was released. Nothing was charged.'}
  };

  return {create, accept, decline, arrive, complete, cancel, rate, GUEST_STATE, PAY_METHODS, Pay};
})();
