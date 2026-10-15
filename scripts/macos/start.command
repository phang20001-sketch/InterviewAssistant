#!/bin/zsh
# Load the interactive login environment so npm and fnm work from Finder.
project_root="${0:A:h}/../.."
exec /bin/zsh -lic 'cd -- "$1" && npm start' interview-studio "$project_root"
