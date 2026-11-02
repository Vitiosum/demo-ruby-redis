# ES modules served by Propshaft, no JavaScript build step.
pin "application"
pin "@rails/actioncable", to: "actioncable.esm.js" # ships with Rails
pin_all_from "app/javascript/arcade", under: "arcade"
