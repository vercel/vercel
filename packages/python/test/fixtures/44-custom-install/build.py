import tabulate

def main():
    print(tabulate.tabulate([['Step', 'Status'], ['Install', '✓'], ['Build', '✓']], headers='firstrow'))

if __name__ == "__main__":
    main()
