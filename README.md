# then-jade

  Async promise based Jade.  The language used here is the same as the original [jade](https://github.com/visionmedia/jade) so go look at the docs for most of the language.  Don't look there for two things though:

  1. The programatic API for `then-jade` is a tiny bit different
  2. Filters in `then-jade` are way more powerful, and completely changed.
  3. There will in the future be some sort of awsome `when` mixin in the future that resolves promises for you in place (like QEJS does).

## Installation

  Simple:

    $ npm install then-jade

## API

  If you call `render` or `renderFile` and don't pass a callback function, it will return a promise, but if you pass in a callback it will behave exactly the same as in the normal Jade library.

  If you call `compile` directly then you will get back a function that returns a promise for a string, it doesn't support being passed a callback at this time, if you want callbacks, use `render` or `renderFile`.

## Filters

  `then-jade` supports all the same filters as jade does, but in addition to that you can also use the attributes to pass options to the filters (for example to set syntax highlighting in a markdown library).

  It implements filters differently so that it actually supports any of the templating libraries in [consolidate](https://github.com/visionmedia/consolidate.js) and all the languages in [consolidate-build](https://github.com/ForbesLindesay/consolidate-build).  You can also pass arguments to those other templating libraries on the fly:

```jade
html
  head
    :coffeescript
      regexp = /\n/
  body
    :ejs(user=user)
      <h1>Welcome <%= user.name %></h1>
    p
      | This is back to being in jade.
      | Your user ID is #{user.id}
```

  Note that if you pass only constant arguments to your filters, they will be run at compile time, and therfore provide better performance (assuming you compile once and render multiple times).


  There is also an option to filter a seperate file and include it:

```jade
html
  head
    :coffeescript path/to/script.coffee
  body
    :ejs(user=user) ejs/welcome-message.ejs
    :markdown docs/readme.md
```

## Road Map

  The following are features I want to implement (when I get time)

   1. Using promies directly in the jade via some sort of `when` function.
