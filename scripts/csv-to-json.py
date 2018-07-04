import csv
import json
import sys

filename = sys.argv[1]

with open(filename, 'r') as csvfile, open('parsed_facilities.json', 'w') as outfile:
    csvreader = csv.DictReader(csvfile)
    json.dump(list(csvreader), outfile)
