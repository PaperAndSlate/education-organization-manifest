# Why EOM Exists

## The problem

Public educational information is routinely published in forms that humans can read but software cannot reliably discover or interpret:

- navigation-heavy websites;
- PDFs;
- vendor portals;
- unversioned spreadsheets;
- image-based menus;
- course descriptions embedded in CMS pages;
- calendars with inconsistent formats;
- disconnected government datasets.

The same facts are repeatedly copied, scraped, normalized, and allowed to become stale.

## The proposed intervention

EOM gives an educational organization one predictable public discovery point on its own web origin. The root manifest identifies the organization, publication scope, supported modules, authoritative resources, provenance, delegation, and optional integrity information.

## Why a well-known resource

A predictable path reduces prior coordination. A consumer that knows an organization's origin can attempt discovery without knowing the site's CMS, navigation, vendor, or URL structure.

The root remains small so:

- it is cheap to fetch;
- it changes less often;
- optional modules fail independently;
- large catalogs stay scalable;
- authority and capability discovery remain understandable.

## Public-interest outcomes

Potential outcomes include:

- schools maintain one reusable public-data source;
- course information can power websites, catalogs, search, and APIs;
- vendors integrate through explicit modules;
- public information carries source and effective dates;
- accessibility and multilingual tools receive structured inputs;
- government and foundation indexes can preserve origin authority;
- developers can build without scraping every site differently;
- corrections can flow from the publishing organization.

## What EOM does not solve

EOM does not guarantee that a claim is true, current, lawful, or complete. It provides structure, authority signals, provenance, and validation. Human governance remains necessary.

It is not:

- a student information format;
- an LMS;
- an SIS;
- an admissions transaction system;
- a credential wallet;
- a replacement for private education interoperability standards;
- a centralized ownership claim by paper&slate.
