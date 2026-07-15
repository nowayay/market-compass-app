/**
 * A fictional KRS OdpisAktualny-shaped fixture. All values are invented for
 * testing. The `dzial2` section deliberately contains FAKE natural-person data
 * purely to prove that the allowlist mapper never copies it into the result.
 * No real personal data is used.
 */
export const fakeKrsExtract: unknown = {
  odpis: {
    naglowekA: {
      rejestr: "P",
      numerKRS: "0000123456",
      dataRejestracjiWKRS: "2011.03.15",
    },
    dane: {
      dzial1: {
        danePodmiotu: {
          formaPrawna: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
          identyfikatory: { regon: "142000000", nip: "5270000000" },
          nazwa: "PRZYKŁADOWA SPÓŁKA SP. Z O.O.",
        },
        siedzibaIAdres: {
          siedziba: {
            kraj: "POLSKA",
            wojewodztwo: "MAZOWIECKIE",
            powiat: "Warszawa",
            gmina: "Warszawa",
            miejscowosc: "WARSZAWA",
          },
          // Full street address must NOT be mapped.
          adres: {
            ulica: "KWIATOWA",
            nrDomu: "10",
            nrLokalu: "5",
            kodPocztowy: "00-001",
            miejscowosc: "WARSZAWA",
          },
        },
        przedmiotDzialalnosci: {
          przedmiotPrzewazajacejDzialalnosci: [
            { kodDzial: "62", kodKlasa: "01", kodPodklasa: "Z", opis: "Działalność związana z oprogramowaniem" },
          ],
          przedmiotPozostalejDzialalnosci: [
            { kodDzial: "63", kodKlasa: "11", kodPodklasa: "Z", opis: "Przetwarzanie danych" },
          ],
        },
      },
      // People-bearing section — FAKE data, must never be mapped.
      dzial2: {
        reprezentacja: {
          sklad: [
            { nazwisko: "KOWALSKI", imiona: "JAN", funkcja: "PREZES ZARZĄDU", pesel: "00000000000" },
          ],
        },
        organNadzoru: {
          sklad: [{ nazwisko: "NOWAK", imiona: "ANNA", funkcja: "CZŁONEK RADY NADZORCZEJ" }],
        },
        prokurenci: [{ nazwisko: "WIŚNIEWSKI", imiona: "PIOTR", rodzajProkury: "SAMOISTNA" }],
      },
      dzial3: {
        przedmiotDzialalnosci: {},
      },
    },
  },
};
