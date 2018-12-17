const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { User } = require('../users');
const { Movie } = require('../movies');
const { Conversation } = require('../conversation/models');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const socket = require('socket.io');
const fetch = require('node-fetch');
const { CLOUDINARY_BASE_URL, CLOUDINARY_UPLOAD_PRESET } = require('../config');

router.put('/:id', jsonParser, (req, res, next) => {
  let { id } = req.params;
  let updatedUser;

  if (req.user.id !== id) {
    let err = new Error('Hold up sir that is not your id');
    err.status = 401;
    next(err);
  }

  let { genres, movies } = req.body;

  if (genres) {
    if (genres.length > 3) {
      genres = genres.slice(0, 3);
    }
    if (!genres.length) {
      let err = new Error('Please select at least 1 genre');
      err.status = 400;
      next(err);
    }
    User.findOneAndUpdate({ _id: id }, { genres: genres }, { new: true })
      .then(user => res.json(user.serialize()))
      .catch(err => {
        return next(err);
      });
  } else if (movies) {
    if (!movies.length) {
      let err = new Error('Please select at least 1 movie');
      err.status = 400;
      next(err);
    }
    User.findByIdAndUpdate({ _id: id }, { movies: movies }, { new: true })
      .then(user => {
        updatedUser = user.serialize();
        return Movie.updateMany(
          { _id: { $in: movies } },
          { $push: { users: id } },
          { new: true }
        );
      })
      .then(() => res.json(updatedUser))
      .catch(err => {
        return next(err);
      });
  } else {
    return next();
  }
});

router.get('/', (req, res, next) => {
  //Query Movie database for all the matching movies
  //Create dictionary of user id's
  //if userId appears more than 55% of the time capture User
  //(userIdDictionary[movies[i].users[j]] < proportion)

  let userIdDictionary = {};
  let ourMatches = [];

  let movies;
  let _user;
  let sortedIds;
  const { id } = req.user;
  User.findById(id)
    .populate({ path: 'matched._id', select: 'username' })
    .then(user => {
      _user = user;
      movies = user.movies;
      return Movie.find({ _id: { $in: movies } }, { _id: 0, users: 1 });
    })
    .then(movies => {
      for (let i = 0; i < movies.length; i++) {
        for (let j = 0; j < movies[i].users.length; j++) {
          if (!userIdDictionary[movies[i].users[j]]) {
            userIdDictionary[movies[i].users[j]] = 1;
          } else {
            userIdDictionary[movies[i].users[j]]++;
          }
        }
      }

      for (let id in userIdDictionary) {
        if (
          id !== req.user.id &&
					!_user.matched.find(userId => userId._id._id.toString() === id) &&
					!_user.ignored.find(userId => userId.toString() === id) &&
					!_user.whoUserPopcorned.find(userId => userId.toString() === id)
        ) {
          ourMatches.push({ id, count: userIdDictionary[id] });
        }
      }

      let sortedObj = ourMatches.sort((user1, user2) => {
        return user2.count - user1.count;
      });

      sortedIds = sortedObj.map(obj => obj.id);
      for (let i = 0; i < _user.ignored.length; i++) {
        sortedIds.push(_user.ignored[i].toString());
      }

      return User.find({ _id: { $in: sortedIds } }).populate({
        path: 'movies',
        select: 'title poster imdbID'
      });
    })
    .then(users => {
      let serializedUser = users.map(user => user.serialize());
      let response = [];
      for (let i = 0; i < sortedIds.length; i++) {
        let currentUser = serializedUser.find(
          user => user.id.toString() === sortedIds[i]
        );
        if (currentUser) {
          response.push(currentUser);
        }
      }
      res.json(response);
    })
    .catch(err => {
      next(err);
    });
});

//NICK PROFILE PICTURE STUFF

router.get('/profilePicture/:id', (req, res, next) => {
  let { id } = req.params;

  User.findOne({ _id: id }, { profilePicture: 1 })
    .then(user => {
      res.json(user);
    })
    .catch(err => next(err));
});

router.post('/profilePicture/:id', jsonParser, (req, res, next) => {
  let { id } = req.params;
  let form = req.body;

   if (req.user.id !== id) {
    let err = new Error('Hold up sir that is not your id');
    err.status = 401;
    return next(err);
  }
  
  let { profilePic } = req.body;

  User.findOneAndUpdate(
    { _id: id },
    { profilePicture: profilePic },
    { new: true }
  )
    .then(user => {
      res.status(201).json(user);
    })
    .catch(err => console.log(err));
});

//LOCATION OF USERS

//GET USERS NEAR THE USER MAKING THE REQUEST
router.get('/location', (req, res, next) => {
  const lng = parseFloat(req.query.lng);
  const lat = parseFloat(req.query.lat);

  User.aggregate().near({
    near: {type: 'Point', coordinates: [lng, lat]},
    maxDistance: 1609340,
    spherical: true,
    distanceField: "dis"
  }).then(users => res.json(users)
  ).catch(err => next(err));
});

//UPDATE THE USER'S LOCATION
router.put('/location/:id', jsonParser, (req, res, next) => {
  const { id } = req.params;
  const { city, coordinates } = req.body;

  if (req.user.id !== id) {
    let err = new Error('Woah woah woah, no way baby. That ain\'t yours');
    err.status = 401;
    next(err);
  }
  User.findOneAndUpdate({ _id: id }, { location: { city, coordinates }, geometry: { type: 'point', coordinates: [coordinates.longitude, coordinates.latitude] } })
    .then((user) => res.json(user))
    .catch(err => next(err));
});
module.exports = { router };
